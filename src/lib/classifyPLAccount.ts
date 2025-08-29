export const classifyPLAccount = (
  accountType?: string | null,
  reportCategory?: string | null,
  accountName?: string | null,
): "INCOME" | "EXPENSES" | null => {
  const typeLower = accountType?.toLowerCase() || "";
  const nameLower = accountName?.toLowerCase() || "";
  const categoryLower = reportCategory?.toLowerCase() || "";

  const isTransfer =
    categoryLower === "transfer" || nameLower.includes("transfer");
  const isCashAccount =
    typeLower.includes("bank") ||
    typeLower.includes("cash") ||
    nameLower.includes("checking") ||
    nameLower.includes("savings") ||
    nameLower.includes("cash");

  if (isCashAccount || isTransfer) return null;

  const isIncomeAccount =
    typeLower === "income" ||
    typeLower === "other income" ||
    typeLower.includes("income") ||
    typeLower.includes("revenue");

  const isExpenseAccount =
    typeLower === "expenses" ||
    typeLower === "expense" ||
    typeLower === "other expense" ||
    typeLower === "cost of goods sold" ||
    typeLower.includes("expense");

  if (isIncomeAccount) return "INCOME";
  if (isExpenseAccount) return "EXPENSES";
  return null;
};
