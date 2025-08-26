import { sql } from "../config/db.js";

/**
 * Create a new inventory log entry
 * @param {Object} logData - Inventory log data
 * @returns {Promise<Object>} Created log entry
 */
export const createInventoryLog = async (logData) => {
  const { batch_id, action, quantity_kg, reason, performed_by, notes } =
    logData;

  const result = await sql`
    INSERT INTO inventory_logs (batch_id, action, quantity_kg, reason, performed_by, notes)
    VALUES (${batch_id}, ${action}, ${quantity_kg}, ${reason}, ${performed_by}, ${notes})
    RETURNING *
  `;

  return result[0];
};

/**
 * Get an inventory log entry by ID
 * @param {number} id - Log entry ID
 * @returns {Promise<Object>} Log entry
 */
export const getInventoryLogById = async (id) => {
  const result = await sql`
    SELECT il.*, b.variety, b.source_farm, b.quality_grade
    FROM inventory_logs il
    LEFT JOIN batches b ON il.batch_id = b.id
    WHERE il.id = ${id}
  `;

  return result[0];
};

/**
 * Get inventory logs for a specific batch
 * @param {number} batchId - Batch ID
 * @returns {Promise<Array>} Array of log entries
 */
export const getInventoryLogsByBatch = async (batchId) => {
  const result = await sql`
    SELECT * FROM inventory_logs
    WHERE batch_id = ${batchId}
    ORDER BY created_at DESC
  `;

  return result;
};

/**
 * Get inventory logs by action type
 * @param {string} action - Action type (addition, removal, etc.)
 * @returns {Promise<Array>} Array of log entries
 */
export const getInventoryLogsByAction = async (action) => {
  const result = await sql`
    SELECT il.*, b.variety, b.source_farm
    FROM inventory_logs il
    LEFT JOIN batches b ON il.batch_id = b.id
    WHERE il.action = ${action}
    ORDER BY il.created_at DESC
  `;

  return result;
};

/**
 * Get inventory logs within a date range
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @returns {Promise<Array>} Array of log entries
 */
export const getInventoryLogsByDateRange = async (startDate, endDate) => {
  const result = await sql`
    SELECT il.*, b.variety, b.source_farm
    FROM inventory_logs il
    LEFT JOIN batches b ON il.batch_id = b.id
    WHERE il.created_at >= ${startDate} AND il.created_at <= ${endDate}
    ORDER BY il.created_at DESC
  `;

  return result;
};

/**
 * Update an inventory log entry
 * @param {number} id - Log entry ID
 * @param {Object} logData - Log data to update
 * @returns {Promise<Object>} Updated log entry
 */
export const updateInventoryLog = async (id, logData) => {
  const { reason, notes } = logData;

  // Only allow updating reason and notes to maintain data integrity
  const result = await sql`
    UPDATE inventory_logs
    SET
      reason = COALESCE(${reason}, reason),
      notes = COALESCE(${notes}, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0];
};

/**
 * Get inventory movement summary for a date range
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @returns {Promise<Object>} Summary data
 */
export const getInventoryMovementSummary = async (startDate, endDate) => {
  const summary = await sql`
    SELECT
      action,
      COUNT(*) as count,
      SUM(quantity_kg) as total_kg
    FROM inventory_logs
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    GROUP BY action
  `;

  const dailyMovements = await sql`
    SELECT
      DATE(created_at) as date,
      action,
      SUM(quantity_kg) as total_kg
    FROM inventory_logs
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    GROUP BY DATE(created_at), action
    ORDER BY date
  `;

  return {
    summary,
    dailyMovements,
  };
};

/**
 * Get the most recent inventory logs
 * @param {number} limit - Number of logs to retrieve
 * @returns {Promise<Array>} Array of recent log entries
 */
export const getRecentInventoryLogs = async (limit = 10) => {
  const result = await sql`
    SELECT il.*, b.variety, b.source_farm
    FROM inventory_logs il
    LEFT JOIN batches b ON il.batch_id = b.id
    ORDER BY il.created_at DESC
    LIMIT ${limit}
  `;

  return result;
};
