import { sql } from "../config/db.js";

// Get all inventory logs
export const getInventoryLogs = async (req, res) => {
  try {
    const { batch_id, action, startDate, endDate } = req.query;

    let query = sql`
      SELECT il.*, b.variety, b.source_farm
      FROM inventory_logs il
      LEFT JOIN batches b ON il.batch_id = b.id
      WHERE 1=1
    `;

    if (batch_id) {
      query = sql`${query} AND il.batch_id = ${batch_id}`;
    }

    if (action) {
      query = sql`${query} AND il.action = ${action}`;
    }

    if (startDate) {
      query = sql`${query} AND il.created_at >= ${startDate}`;
    }

    if (endDate) {
      query = sql`${query} AND il.created_at <= ${endDate}`;
    }

    query = sql`${query} ORDER BY il.created_at DESC`;

    const logs = await query;

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.log("Error in getInventoryLogs function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Create inventory log entry
export const createInventoryLog = async (req, res) => {
  const { batch_id, action, quantity_kg, reason, performed_by } = req.body;

  if (!batch_id || !action || !quantity_kg || !reason) {
    return res.status(400).json({
      success: false,
      message: "Required fields: batch_id, action, quantity_kg, reason",
    });
  }

  // Validate action type
  if (!["addition", "removal", "quality_check", "transfer"].includes(action)) {
    return res.status(400).json({
      success: false,
      message:
        "Action must be one of: addition, removal, quality_check, transfer",
    });
  }

  try {
    // First check if the batch exists
    const batch = await sql`SELECT * FROM batches WHERE id = ${batch_id}`;

    if (batch.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Create log entry
    const newLog = await sql`
      INSERT INTO inventory_logs (
        batch_id,
        action,
        quantity_kg,
        reason,
        performed_by
      )
      VALUES (
        ${batch_id},
        ${action},
        ${quantity_kg},
        ${reason},
        ${performed_by || req.user?.id || "system"}
      )
      RETURNING *
    `;

    // Update batch quantity if action is addition or removal
    if (action === "addition" || action === "removal") {
      const currentQuantity = batch[0].quantity_kg;
      const newQuantity =
        action === "addition"
          ? currentQuantity + quantity_kg
          : currentQuantity - quantity_kg;

      // Prevent negative inventory
      if (newQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot remove more than available quantity",
        });
      }

      await sql`
        UPDATE batches
        SET quantity_kg = ${newQuantity},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${batch_id}
      `;
    }

    res.status(201).json({
      success: true,
      data: newLog[0],
      message: "Inventory log created successfully",
    });
  } catch (error) {
    console.log("Error in createInventoryLog function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get a single inventory log by ID
export const getInventoryLog = async (req, res) => {
  const { id } = req.params;

  try {
    const log = await sql`
      SELECT il.*, b.variety, b.source_farm
      FROM inventory_logs il
      LEFT JOIN batches b ON il.batch_id = b.id
      WHERE il.id = ${id}
    `;

    if (log.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inventory log not found",
      });
    }

    res.status(200).json({ success: true, data: log[0] });
  } catch (error) {
    console.log("Error in getInventoryLog function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get inventory summary
export const getInventorySummary = async (req, res) => {
  try {
    const summary = await sql`
      SELECT 
        SUM(quantity_kg) as total_kg,
        COUNT(*) as total_batches,
        COUNT(CASE WHEN status = 'in_storage' THEN 1 END) as batches_in_storage,
        COUNT(CASE WHEN status = 'pending_shipment' THEN 1 END) as batches_pending_shipment,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as batches_shipped,
        COUNT(CASE WHEN spoilage_risk = 'high' THEN 1 END) as high_risk_batches,
        COUNT(CASE WHEN spoilage_risk = 'medium' THEN 1 END) as medium_risk_batches,
        AVG(EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE)) as avg_days_remaining
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
    `;

    // Get storage location breakdown
    const locationBreakdown = await sql`
      SELECT 
        storage_location,
        COUNT(*) as batch_count,
        SUM(quantity_kg) as total_kg
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
      GROUP BY storage_location
      ORDER BY total_kg DESC
    `;

    // Get recent inventory movements
    const recentMovements = await sql`
      SELECT il.*, b.variety
      FROM inventory_logs il
      LEFT JOIN batches b ON il.batch_id = b.id
      ORDER BY il.created_at DESC
      LIMIT 5
    `;

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0],
        locationBreakdown,
        recentMovements,
      },
    });
  } catch (error) {
    console.log("Error in getInventorySummary function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Update an inventory log (for corrections)
export const updateInventoryLog = async (req, res) => {
  const { id } = req.params;
  const { reason, notes } = req.body;

  try {
    // Only allow updating reason and notes, not quantities or actions
    // This preserves audit trail integrity
    const updatedLog = await sql`
      UPDATE inventory_logs
      SET 
        reason = COALESCE(${reason}, reason),
        notes = COALESCE(${notes}, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (updatedLog.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inventory log not found",
      });
    }

    res.status(200).json({
      success: true,
      data: updatedLog[0],
      message: "Inventory log updated successfully",
    });
  } catch (error) {
    console.log("Error in updateInventoryLog function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get storage area capacity
export const getStorageCapacity = async (req, res) => {
  try {
    // This would typically come from a configuration table
    // Here we're using hardcoded values for demonstration
    const capacityData = [
      { location: "Zone A", capacity_kg: 10000, current_usage_kg: 0 },
      { location: "Zone B", capacity_kg: 10000, current_usage_kg: 0 },
      { location: "Zone C", capacity_kg: 10000, current_usage_kg: 0 },
      { location: "Cold Storage 1", capacity_kg: 5000, current_usage_kg: 0 },
      { location: "Cold Storage 2", capacity_kg: 5000, current_usage_kg: 0 },
    ];

    // Get current usage by location
    const usageByLocation = await sql`
      SELECT 
        storage_location,
        SUM(quantity_kg) as current_usage_kg
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
      GROUP BY storage_location
    `;

    // Update capacity data with current usage
    for (const usage of usageByLocation) {
      const locationData = capacityData.find(
        (loc) => loc.location === usage.storage_location
      );
      if (locationData) {
        locationData.current_usage_kg = usage.current_usage_kg;
      } else {
        capacityData.push({
          location: usage.storage_location,
          capacity_kg: 10000, // Default capacity
          current_usage_kg: usage.current_usage_kg,
        });
      }
    }

    // Calculate percentages and add recommendation
    const capacityWithMetrics = capacityData.map((loc) => {
      const usagePercent = (loc.current_usage_kg / loc.capacity_kg) * 100;
      let status = "available";
      let recommendation = "";

      if (usagePercent > 90) {
        status = "critical";
        recommendation = "Urgent: Schedule shipment to free up space";
      } else if (usagePercent > 75) {
        status = "warning";
        recommendation = "Plan for shipment in the next few days";
      } else if (usagePercent < 20) {
        status = "underutilized";
        recommendation = "Consider consolidating with other storage areas";
      }

      return {
        ...loc,
        usage_percent: Math.round(usagePercent),
        available_kg: loc.capacity_kg - loc.current_usage_kg,
        status,
        recommendation,
      };
    });

    res.status(200).json({
      success: true,
      data: capacityWithMetrics,
      total_capacity: capacityData.reduce(
        (sum, loc) => sum + loc.capacity_kg,
        0
      ),
      total_usage: capacityData.reduce(
        (sum, loc) => sum + loc.current_usage_kg,
        0
      ),
    });
  } catch (error) {
    console.log("Error in getStorageCapacity function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
