import { filterCategoriesActiveOnDate } from './category-effective-date.js';
import { buildPreviousWeekBudgetDefaults, previousSameWeekdayMinutes } from './time-budget-domain.js';

const DEFAULT_SOURCE_VERSION = 'previous-results-v3';

function needsDefaults(document, valuesKey) {
  if (!document) return true;
  if (document.userModified || document.defaultSourceVersion === DEFAULT_SOURCE_VERSION) return false;
  if (document.initializedFromPreviousResults) return false;
  if ((document.explicitBudgetIds || []).length) return false;
  // Legacy documents with values may be manually entered, including explicit 0.
  return Object.keys(document[valuesKey] || {}).length === 0;
}

// Pure planning only: time-budget-feature is the sole owner of initialization.
export function buildPreviousResultSnapshots({ categories = [], entries = [], weeklyBudgets = [], dailyBudgets = [], today, weekStart }) {
  const currentWeek = weeklyBudgets.find((item) => (item.weekStart || item.id) === weekStart);
  const currentDay = dailyBudgets.find((item) => (item.date || item.id) === today);
  const activeCategories = filterCategoriesActiveOnDate(categories, today);
  return {
    weekly: needsDefaults(currentWeek, 'budgets') ? {
      id: currentWeek?.id || weekStart, weekStart,
      budgets: buildPreviousWeekBudgetDefaults({ categories: activeCategories, entries, weekStart }),
      explicitBudgetIds: [], initializedFromPreviousResults: true,
      userModified: false, defaultSourceVersion: DEFAULT_SOURCE_VERSION,
    } : null,
    daily: needsDefaults(currentDay, 'overrides') ? {
      date: today,
      overrides: Object.fromEntries(activeCategories.map((category) => [category.id, previousSameWeekdayMinutes(entries, category.id, today)])),
      userModified: false, defaultSourceVersion: DEFAULT_SOURCE_VERSION,
    } : null,
  };
}
