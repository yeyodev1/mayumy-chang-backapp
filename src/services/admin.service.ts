import { PipelineStage } from "mongoose";
import { ORDER_STATUSES, OrderStatus, PAID_STATUSES } from "../config/store";
import { Order } from "../models/order.model";
import { User } from "../models/user.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { countSince as countLeadsSince } from "./lead.service";
import { expireStaleCardOrders } from "./order.service";
import { lowStock as lowStockProducts } from "./product.service";

// Ecuador continental no tiene horario de verano: UTC-5 fijo.
const TIMEZONE = "America/Guayaquil";
const TZ_OFFSET_HOURS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// Lo que el equipo tiene que mover: por aprobar, pagados o en preparación.
const PENDING_FULFILLMENT: OrderStatus[] = ["review", "paid", "preparing"];
const TOP_PRODUCTS_LIMIT = 5;

/** Medianoche de hoy en Guayaquil, como Date UTC. */
function startOfTodayEc(now = new Date()): Date {
  const local = new Date(now.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), TZ_OFFSET_HOURS),
  );
}

function startOfMonthEc(now = new Date()): Date {
  const local = new Date(now.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, TZ_OFFSET_HOURS));
}

function ecDateKey(date: Date): string {
  return new Date(date.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getStats() {
  const today = startOfTodayEc();
  const month = startOfMonthEc();
  const from30 = new Date(today.getTime() - 29 * DAY_MS);
  const paidMatch = { status: { $in: PAID_STATUSES } };

  await expireStaleCardOrders().catch((error) => {
    console.error("[admin] no se pudieron vencer reservas abandonadas:", error);
  });

  const [revenue, byStatus, topProducts, leadsThisMonth, daily, pendingFulfillment, lowStock] =
    await Promise.all([
      Order.aggregate([
        { $match: { ...paidMatch, paidAt: { $gte: month } } },
        {
          $group: {
            _id: null,
            month: { $sum: "$totalCents" },
            today: { $sum: { $cond: [{ $gte: ["$paidAt", today] }, "$totalCents", 0] } },
            ordersToday: { $sum: { $cond: [{ $gte: ["$paidAt", today] }, 1, 0] } },
          },
        },
      ]),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { ...paidMatch, paidAt: { $gte: from30 } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            quantity: { $sum: "$items.quantity" },
            revenueCents: { $sum: "$items.lineTotalCents" },
          },
        },
        { $sort: { revenueCents: -1, quantity: -1 } },
        { $limit: TOP_PRODUCTS_LIMIT },
        { $project: { _id: 0, name: 1, quantity: 1, revenueCents: 1 } },
      ]),
      countLeadsSince(month),
      Order.aggregate([
        { $match: { ...paidMatch, paidAt: { $gte: from30 } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: TIMEZONE } },
            revenueCents: { $sum: "$totalCents" },
            orders: { $sum: 1 },
          },
        },
      ]),
      Order.countDocuments({ status: { $in: PENDING_FULFILLMENT } }),
      lowStockProducts(),
    ]);

  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const row of byStatus) ordersByStatus[row._id as OrderStatus] = row.count;

  // Se rellenan los días sin ventas para que el gráfico no tenga huecos.
  const dailyMap = new Map(daily.map((d) => [d._id as string, d]));
  const salesLast30 = Array.from({ length: 30 }, (_, i) => {
    const date = ecDateKey(new Date(from30.getTime() + i * DAY_MS));
    const row = dailyMap.get(date);
    return { date, revenueCents: row?.revenueCents ?? 0, orders: row?.orders ?? 0 };
  });

  return {
    revenueTodayCents: revenue[0]?.today ?? 0,
    revenueMonthCents: revenue[0]?.month ?? 0,
    ordersToday: revenue[0]?.ordersToday ?? 0,
    ordersPendingFulfillment: pendingFulfillment,
    ordersByStatus,
    topProducts,
    leadsThisMonth,
    lowStock,
    salesLast30,
  };
}

export async function listCustomers(query: { search?: unknown; page?: unknown; limit?: unknown }) {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const match: Record<string, unknown> = { accountType: "customer" };
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      // Por usuario o por correo: incluye lo que compró como invitado antes de crear la cuenta.
      $lookup: {
        from: Order.collection.name,
        let: { userId: "$_id", email: "$email" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ["$status", PAID_STATUSES] },
                  {
                    $or: [{ $eq: ["$user", "$$userId"] }, { $eq: ["$customer.email", "$$email"] }],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              ordersCount: { $sum: 1 },
              totalSpentCents: { $sum: "$totalCents" },
              lastOrderAt: { $max: "$paidAt" },
            },
          },
        ],
        as: "stats",
      },
    },
    {
      $project: {
        name: 1,
        email: 1,
        phone: 1,
        createdAt: 1,
        ordersCount: { $ifNull: [{ $first: "$stats.ordersCount" }, 0] },
        totalSpentCents: { $ifNull: [{ $first: "$stats.totalSpentCents" }, 0] },
        lastOrderAt: { $ifNull: [{ $first: "$stats.lastOrderAt" }, null] },
      },
    },
  ];

  const [items, total] = await Promise.all([User.aggregate(pipeline), User.countDocuments(match)]);
  return paginated(items, total, page, limit);
}
