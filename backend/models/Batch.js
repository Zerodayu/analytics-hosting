import { sql } from "../config/db.js";

/**
 * Create a new batch
 * @param {Object} batchData - Batch data
 * @returns {Promise<Object>} Created batch
 */
export const createBatch = async (batchData) => {
  const {
    variety,
    quantity_kg,
    harvest_date,
    source_farm,
    storage_location,
    estimated_shelf_life,
    quality_grade,
    temperature_requirement,
    humidity_requirement,
    qr_code_url,
  } = batchData;

  const result = await sql`
    INSERT INTO batches (
      variety, 
      quantity_kg,
      harvest_date,
      source_farm,
      storage_location,
      estimated_shelf_life,
      quality_grade,
      temperature_requirement,
      humidity_requirement,
      status,
      qr_code_url
    )
    VALUES (
      ${variety},
      ${quantity_kg},
      ${harvest_date},
      ${source_farm},
      ${storage_location},
      ${estimated_shelf_life || 14}, // Default for Cavendish
      ${quality_grade || "A"},
      ${temperature_requirement || "13-15"}, // Default for Cavendish
      ${humidity_requirement || "90-95"}, // Default for Cavendish
      ${"in_storage"},
      ${qr_code_url}
    )
    RETURNING *
  `;

  return result[0];
};

/**
 * Get a batch by ID
 * @param {number} id - Batch ID
 * @returns {Promise<Object>} Batch object
 */
export const getBatchById = async (id) => {
  const result = await sql`
    SELECT b.*, 
      EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
    FROM batches b
    WHERE b.id = ${id}
  `;

  return result[0];
};

/**
 * Get all batches with optional filtering
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} Array of batches
 */
export const getAllBatches = async (filters = {}) => {
  const { status, location, daysUntilExpiry, variety, quality_grade } = filters;

  let query = sql`
    SELECT b.*, 
      EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
    FROM batches b
    WHERE 1=1
  `;

  if (status) {
    query = sql`${query} AND b.status = ${status}`;
  }

  if (location) {
    query = sql`${query} AND b.storage_location = ${location}`;
  }

  if (daysUntilExpiry) {
    query = sql`${query} AND EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= ${daysUntilExpiry}`;
  }

  if (variety) {
    query = sql`${query} AND b.variety = ${variety}`;
  }

  if (quality_grade) {
    query = sql`${query} AND b.quality_grade = ${quality_grade}`;
  }

  query = sql`${query} ORDER BY days_remaining ASC`;

  const result = await query;
  return result;
};

/**
 * Update a batch
 * @param {number} id - Batch ID
 * @param {Object} batchData - Batch data to update
 * @returns {Promise<Object>} Updated batch
 */
export const updateBatch = async (id, batchData) => {
  const {
    quantity_kg,
    storage_location,
    status,
    quality_grade,
    temperature_actual,
    humidity_actual,
    spoilage_risk,
    destination,
    transportation_type,
    expected_delivery_date,
    qr_code_url,
  } = batchData;

  const result = await sql`
    UPDATE batches
    SET 
      quantity_kg = COALESCE(${quantity_kg}, quantity_kg),
      storage_location = COALESCE(${storage_location}, storage_location),
      status = COALESCE(${status}, status),
      quality_grade = COALESCE(${quality_grade}, quality_grade),
      temperature_actual = COALESCE(${temperature_actual}, temperature_actual),
      humidity_actual = COALESCE(${humidity_actual}, humidity_actual),
      spoilage_risk = COALESCE(${spoilage_risk}, spoilage_risk),
      destination = COALESCE(${destination}, destination),
      transportation_type = COALESCE(${transportation_type}, transportation_type),
      expected_delivery_date = COALESCE(${expected_delivery_date}, expected_delivery_date),
      qr_code_url = COALESCE(${qr_code_url}, qr_code_url),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0];
};

/**
 * Delete a batch
 * @param {number} id - Batch ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteBatch = async (id) => {
  const result = await sql`
    DELETE FROM batches
    WHERE id = ${id}
    RETURNING id
  `;

  return result.length > 0;
};

/**
 * Get batches at risk of spoilage
 * @param {number} daysThreshold - Days remaining threshold
 * @returns {Promise<Array>} Array of at-risk batches
 */
export const getBatchesAtRisk = async (daysThreshold = 3) => {
  const result = await sql`
    SELECT b.*, 
      EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining
    FROM batches b
    WHERE 
      (EXTRACT(DAY FROM (b.harvest_date + (b.estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= ${daysThreshold}
      OR b.spoilage_risk IN ('medium', 'high'))
      AND b.status IN ('in_storage', 'pending_shipment')
    ORDER BY days_remaining ASC, 
      CASE 
        WHEN b.spoilage_risk = 'high' THEN 1 
        WHEN b.spoilage_risk = 'medium' THEN 2
        ELSE 3
      END
  `;

  return result;
};

/**
 * Mark a batch for distribution/shipping
 * @param {number} id - Batch ID
 * @param {Object} shipmentData - Shipment data
 * @returns {Promise<Object>} Updated batch
 */
export const markBatchForDistribution = async (id, shipmentData) => {
  const { destination, transportation_type, expected_delivery_date } =
    shipmentData;

  const result = await sql`
    UPDATE batches
    SET 
      status = 'pending_shipment',
      destination = ${destination},
      transportation_type = ${transportation_type},
      expected_delivery_date = ${expected_delivery_date || null},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0];
};

/**
 * Get inventory summary by storage location
 * @returns {Promise<Array>} Array of location summaries
 */
export const getInventoryByLocation = async () => {
  const result = await sql`
    SELECT 
      storage_location,
      COUNT(*) as batch_count,
      SUM(quantity_kg) as total_kg,
      AVG(EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE)) as avg_days_remaining,
      COUNT(CASE WHEN spoilage_risk = 'high' THEN 1 END) as high_risk_batches
    FROM batches
    WHERE status IN ('in_storage', 'pending_shipment')
    GROUP BY storage_location
    ORDER BY total_kg DESC
  `;

  return result;
};

/**
 * Update batch environmental conditions
 * @param {number} id - Batch ID
 * @param {number} temperature - Current temperature
 * @param {number} humidity - Current humidity
 * @returns {Promise<Object>} Updated batch with calculated spoilage risk
 */
export const updateBatchConditions = async (id, temperature, humidity) => {
  // First get current batch data
  const batch = await getBatchById(id);

  if (!batch) {
    throw new Error("Batch not found");
  }

  // Calculate spoilage risk
  let spoilageRisk = "low";

  // Check temperature against requirements
  if (temperature) {
    const [minTemp, maxTemp] = batch.temperature_requirement
      .split("-")
      .map(Number);
    if (temperature < minTemp - 2 || temperature > maxTemp + 2) {
      spoilageRisk = "high";
    } else if (temperature < minTemp || temperature > maxTemp) {
      spoilageRisk = "medium";
    }
  }

  // Check humidity against requirements
  if (humidity && spoilageRisk !== "high") {
    const [minHumid, maxHumid] = batch.humidity_requirement
      .split("-")
      .map(Number);
    if (humidity < minHumid - 5 || humidity > maxHumid + 5) {
      spoilageRisk = "high";
    } else if (humidity < minHumid || humidity > maxHumid) {
      spoilageRisk = spoilageRisk === "medium" ? "high" : "medium";
    }
  }

  // Update batch with new conditions and risk assessment
  const result = await sql`
    UPDATE batches
    SET 
      temperature_actual = ${temperature},
      humidity_actual = ${humidity},
      spoilage_risk = ${spoilageRisk},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0];
};
