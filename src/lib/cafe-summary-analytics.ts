import type { CustomerRecord, TransactionRecord } from "@/lib/billing-types";
import type { IngredientRecord } from "@/lib/inventory-types";
import {
  getIstHour,
  getIstHourLabel,
  isTimestampInRange,
  type CafeSummaryDateRange,
} from "@/lib/cafe-summary-time";

export const HIGH_DISCOUNT_RATIO = 0.1;

export type TrendMetric = {
  value: number;
  previousValue: number;
  changePercent: number | null;
};

export type CafeSummaryKpis = {
  revenue: TrendMetric;
  orders: TrendMetric;
  customers: TrendMetric;
  avgBill: TrendMetric;
  discount: TrendMetric;
  discountPercentOfRevenue: number;
};

export type HourlyPoint = {
  hour: number;
  label: string;
  revenue: number;
  orders: number;
};

export type TopSellingItem = {
  name: string;
  quantity: number;
};

export type CustomerOverview = {
  newCustomers: TrendMetric;
  returningCustomers: TrendMetric;
  walkInCustomers: TrendMetric;
  walkInSharePercent: number;
  previousWalkInSharePercent: number;
};

export type CafeSummaryAlert = {
  id: string;
  title: string;
  message: string;
  href?: string;
  hrefLabel?: string;
};

export type CafeSummaryAnalytics = {
  kpis: CafeSummaryKpis;
  hourly: HourlyPoint[];
  topItems: TopSellingItem[];
  customers: CustomerOverview;
  peakHoursLabel: string;
  alerts: CafeSummaryAlert[];
};

function filterTransactions(transactions: TransactionRecord[], range: CafeSummaryDateRange) {
  return transactions.filter((transaction) => isTimestampInRange(transaction.created_at, range));
}

function sumRevenue(transactions: TransactionRecord[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.final_amount, 0);
}

function sumDiscount(transactions: TransactionRecord[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.discount, 0);
}

function getBuyerKey(transaction: TransactionRecord) {
  if (transaction.customer_id) {
    return `customer:${transaction.customer_id}`;
  }

  if (transaction.walk_in_name?.trim()) {
    return `walkin:${transaction.walk_in_name.trim().toLowerCase()}`;
  }

  return `bill:${transaction.id}`;
}

function countUniqueBuyers(transactions: TransactionRecord[]) {
  return new Set(transactions.map(getBuyerKey)).size;
}

function buildTrend(currentValue: number, previousValue: number): TrendMetric {
  const changePercent =
    previousValue === 0 ? (currentValue > 0 ? 100 : 0) : ((currentValue - previousValue) / previousValue) * 100;

  return {
    value: currentValue,
    previousValue,
    changePercent,
  };
}

function buildHourlySeries(transactions: TransactionRecord[]): HourlyPoint[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: getIstHourLabel(hour),
    revenue: 0,
    orders: 0,
  }));

  for (const transaction of transactions) {
    const hour = getIstHour(transaction.created_at);
    if (hour == null || hour < 0 || hour > 23) {
      continue;
    }

    buckets[hour].revenue += transaction.final_amount;
    buckets[hour].orders += 1;
  }

  return buckets;
}

function buildTopItems(transactions: TransactionRecord[], limit = 5): TopSellingItem[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    for (const item of transaction.items) {
      const name = item.productName.trim() || "Unknown product";
      totals.set(name, (totals.get(name) ?? 0) + item.quantity);
    }
  }

  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, limit);
}

function buildCustomerOverview(
  currentTransactions: TransactionRecord[],
  previousTransactions: TransactionRecord[],
  customersById: Map<string, CustomerRecord>,
  currentRange: CafeSummaryDateRange,
  previousRange: CafeSummaryDateRange,
): CustomerOverview {
  const currentRegistered = new Map<string, true>();
  const previousRegistered = new Map<string, true>();
  let currentWalkIns = 0;
  let previousWalkIns = 0;

  for (const transaction of currentTransactions) {
    if (transaction.customer_id) {
      currentRegistered.set(transaction.customer_id, true);
    } else {
      currentWalkIns += 1;
    }
  }

  for (const transaction of previousTransactions) {
    if (transaction.customer_id) {
      previousRegistered.set(transaction.customer_id, true);
    } else {
      previousWalkIns += 1;
    }
  }

  let currentNew = 0;
  let currentReturning = 0;
  let previousNew = 0;
  let previousReturning = 0;

  for (const customerId of currentRegistered.keys()) {
    const customer = customersById.get(customerId);
    const createdAt = customer?.created_at;
    if (!createdAt) {
      currentReturning += 1;
      continue;
    }

    if (isTimestampInRange(createdAt, currentRange)) {
      currentNew += 1;
    } else {
      currentReturning += 1;
    }
  }

  for (const customerId of previousRegistered.keys()) {
    const customer = customersById.get(customerId);
    const createdAt = customer?.created_at;
    if (!createdAt) {
      previousReturning += 1;
      continue;
    }

    if (isTimestampInRange(createdAt, previousRange)) {
      previousNew += 1;
    } else {
      previousReturning += 1;
    }
  }

  const currentBuyers = countUniqueBuyers(currentTransactions);
  const previousBuyers = countUniqueBuyers(previousTransactions);

  return {
    newCustomers: buildTrend(currentNew, previousNew),
    returningCustomers: buildTrend(currentReturning, previousReturning),
    walkInCustomers: buildTrend(currentWalkIns, previousWalkIns),
    walkInSharePercent: currentBuyers === 0 ? 0 : (currentWalkIns / currentBuyers) * 100,
    previousWalkInSharePercent: previousBuyers === 0 ? 0 : (previousWalkIns / previousBuyers) * 100,
  };
}

function buildPeakHoursLabel(transactions: TransactionRecord[]) {
  const hourly = buildHourlySeries(transactions);
  const sorted = [...hourly].sort((left, right) => right.orders - left.orders);
  const peak = sorted[0];

  if (!peak || peak.orders === 0) {
    return "No order activity in this period";
  }

  const secondPeak = sorted.find((point) => point.hour !== peak.hour && point.orders > 0);
  if (!secondPeak) {
    return `Peak time is ${peak.label}`;
  }

  const startHour = Math.min(peak.hour, secondPeak.hour);
  const endHour = Math.max(peak.hour, secondPeak.hour) + 1;
  return `Peak time is ${getIstHourLabel(startHour)} - ${getIstHourLabel(endHour % 24)}`;
}

function isIngredientLowStock(ingredient: IngredientRecord) {
  return ingredient.threshold !== null && ingredient.quantity < ingredient.threshold;
}

export function buildCafeSummaryAnalytics(input: {
  transactions: TransactionRecord[];
  customers: CustomerRecord[];
  ingredients: IngredientRecord[];
  appointmentsToday: number;
  currentRange: CafeSummaryDateRange;
  previousRange: CafeSummaryDateRange;
}): CafeSummaryAnalytics {
  const currentTransactions = filterTransactions(input.transactions, input.currentRange);
  const previousTransactions = filterTransactions(input.transactions, input.previousRange);

  const currentRevenue = sumRevenue(currentTransactions);
  const previousRevenue = sumRevenue(previousTransactions);
  const currentOrders = currentTransactions.length;
  const previousOrders = previousTransactions.length;
  const currentCustomers = countUniqueBuyers(currentTransactions);
  const previousCustomers = countUniqueBuyers(previousTransactions);
  const currentDiscount = sumDiscount(currentTransactions);
  const previousDiscount = sumDiscount(previousTransactions);

  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));

  const kpis: CafeSummaryKpis = {
    revenue: buildTrend(currentRevenue, previousRevenue),
    orders: buildTrend(currentOrders, previousOrders),
    customers: buildTrend(currentCustomers, previousCustomers),
    avgBill: buildTrend(
      currentOrders === 0 ? 0 : currentRevenue / currentOrders,
      previousOrders === 0 ? 0 : previousRevenue / previousOrders,
    ),
    discount: buildTrend(currentDiscount, previousDiscount),
    discountPercentOfRevenue: currentRevenue === 0 ? 0 : (currentDiscount / currentRevenue) * 100,
  };

  const customersOverview = buildCustomerOverview(
    currentTransactions,
    previousTransactions,
    customersById,
    input.currentRange,
    input.previousRange,
  );

  const alerts: CafeSummaryAlert[] = [];
  const lowStockIngredients = input.ingredients.filter(isIngredientLowStock);

  if (lowStockIngredients.length > 0) {
    alerts.push({
      id: "low-stock",
      title: "Low Stock Alert",
      message: lowStockIngredients
        .slice(0, 3)
        .map((ingredient) => ingredient.name)
        .join(", "),
      href: "/dashboard/ingredients",
      hrefLabel: "View inventory",
    });
  }

  alerts.push({
    id: "peak-hours",
    title: "Peak Hours",
    message: buildPeakHoursLabel(currentTransactions),
    href: "/dashboard/transaction",
    hrefLabel: "View details",
  });

  if (kpis.discountPercentOfRevenue >= HIGH_DISCOUNT_RATIO * 100) {
    alerts.push({
      id: "high-discount",
      title: "High Discount Usage",
      message: `Discount given is ${kpis.discountPercentOfRevenue.toFixed(1)}% of total revenue in this period.`,
    });
  }

  if (input.appointmentsToday > 0) {
    alerts.push({
      id: "appointments",
      title: "Upcoming Appointments",
      message: `${input.appointmentsToday} appointment${input.appointmentsToday === 1 ? "" : "s"} scheduled for today`,
      href: "/dashboard/appointments",
      hrefLabel: "View all",
    });
  }

  return {
    kpis,
    hourly: buildHourlySeries(currentTransactions),
    topItems: buildTopItems(currentTransactions),
    customers: customersOverview,
    peakHoursLabel: buildPeakHoursLabel(currentTransactions),
    alerts,
  };
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatTrend(changePercent: number | null) {
  if (changePercent == null) {
    return "0.0%";
  }

  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(1)}%`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}
