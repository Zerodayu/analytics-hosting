import { sql } from "../config/db.js";
import { generateContent } from "../api/aiService.js";

// Get spoilage forecast
export const getSpoilageForecast = async (req, res) => {
  try {
    // Get batches that are at risk of spoilage
    const atRiskBatches = await sql`
      SELECT 
        id,
        variety,
        quantity_kg,
        harvest_date,
        estimated_shelf_life,
        EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining,
        quality_grade,
        temperature_actual,
        humidity_actual,
        temperature_requirement,
        humidity_requirement,
        spoilage_risk
      FROM batches
      WHERE 
        status IN ('in_storage', 'pending_shipment')
        AND (spoilage_risk IN ('medium', 'high') 
          OR EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= 5)
      ORDER BY days_remaining ASC
    `;

    // Calculate potential loss
    const averageKgPrice = 60; // PHP per kg for Cavendish bananas
    let totalRiskQuantity = 0;
    let highRiskQuantity = 0;

    const enrichedBatches = atRiskBatches.map((batch) => {
      let adjustedRisk = batch.spoilage_risk;
      let riskFactor = 0;

      // Adjust risk based on temperature and humidity deviations
      if (batch.temperature_actual && batch.humidity_actual) {
        const [minTemp, maxTemp] = batch.temperature_requirement
          .split("-")
          .map(Number);
        const [minHumid, maxHumid] = batch.humidity_requirement
          .split("-")
          .map(Number);

        const tempDeviation = Math.min(
          Math.abs(batch.temperature_actual - minTemp),
          Math.abs(batch.temperature_actual - maxTemp)
        );

        const humidDeviation = Math.min(
          Math.abs(batch.humidity_actual - minHumid),
          Math.abs(batch.humidity_actual - maxHumid)
        );

        // Calculate risk factor (0-1)
        riskFactor = Math.min(
          1,
          (tempDeviation / 5) * 0.6 + (humidDeviation / 10) * 0.4
        );

        // Adjust risk based on days remaining
        if (batch.days_remaining <= 2) {
          riskFactor = Math.max(riskFactor, 0.8);
        } else if (batch.days_remaining <= 4) {
          riskFactor = Math.max(riskFactor, 0.5);
        }

        // Adjust risk category if needed
        if (riskFactor >= 0.7) {
          adjustedRisk = "high";
        } else if (riskFactor >= 0.4) {
          adjustedRisk = "medium";
        } else {
          adjustedRisk = "low";
        }
      }

      // Count quantities
      if (adjustedRisk === "high") {
        highRiskQuantity += batch.quantity_kg;
      }
      totalRiskQuantity += batch.quantity_kg;

      return {
        ...batch,
        adjusted_risk: adjustedRisk,
        risk_factor: riskFactor,
        estimated_value: batch.quantity_kg * averageKgPrice,
      };
    });

    const potentialLossHigh = highRiskQuantity * averageKgPrice;
    const potentialLossTotal = totalRiskQuantity * averageKgPrice;

    res.status(200).json({
      success: true,
      data: {
        at_risk_batches: enrichedBatches,
        summary: {
          total_at_risk_batches: atRiskBatches.length,
          total_at_risk_quantity_kg: totalRiskQuantity,
          high_risk_quantity_kg: highRiskQuantity,
          potential_loss_high_risk_php: potentialLossHigh,
          potential_loss_total_php: potentialLossTotal,
          average_days_remaining:
            atRiskBatches.reduce(
              (sum, batch) => sum + batch.days_remaining,
              0
            ) / (atRiskBatches.length || 1),
        },
      },
    });
  } catch (error) {
    console.log("Error in getSpoilageForecast function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get distribution recommendations
export const getDistributionRecommendations = async (req, res) => {
  try {
    // Get batches that need to be distributed soon
    const batches = await sql`
      SELECT 
        id,
        variety,
        quantity_kg,
        harvest_date,
        estimated_shelf_life,
        quality_grade,
        EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) as days_remaining,
        spoilage_risk,
        storage_location
      FROM batches
      WHERE 
        status = 'in_storage'
      ORDER BY days_remaining ASC, spoilage_risk DESC
    `;

    // Get current demand data (this would come from an analytics service in a real system)
    // For demonstration, using mock data
    const demandData = {
      local_markets: {
        demand_kg: 5000,
        price_per_kg: 55, // PHP
        priority: "high",
        transportation_time_days: 1,
      },
      supermarkets: {
        demand_kg: 3000,
        price_per_kg: 65, // PHP
        priority: "medium",
        transportation_time_days: 1,
      },
      processors: {
        demand_kg: 2000,
        price_per_kg: 45, // PHP
        priority: "low",
        transportation_time_days: 1,
      },
      exporters: {
        demand_kg: 8000,
        price_per_kg: 70, // PHP
        priority: "medium",
        transportation_time_days: 2,
      },
    };

    // Generate AI-based recommendations
    const promptContent = `
    Based on the following data:
    
    1. We have ${batches.length} batches of Cavendish bananas in storage.
    2. The total quantity is ${batches.reduce(
      (sum, b) => sum + b.quantity_kg,
      0
    )} kg.
    3. The average remaining shelf life is ${Math.round(
      batches.reduce((sum, b) => sum + b.days_remaining, 0) / batches.length
    )} days.
    4. ${
      batches.filter((b) => b.spoilage_risk === "high").length
    } batches are at high risk of spoilage.
    5. ${
      batches.filter((b) => b.days_remaining <= 3).length
    } batches have 3 or fewer days of shelf life remaining.
    
    Provide specific distribution recommendations for how to allocate these bananas to:
    - Local markets (transportation: 1 day, demand: ${
      demandData.local_markets.demand_kg
    } kg, price: PHP ${demandData.local_markets.price_per_kg}/kg)
    - Supermarkets (transportation: 1 day, demand: ${
      demandData.supermarkets.demand_kg
    } kg, price: PHP ${demandData.supermarkets.price_per_kg}/kg)
    - Processors (transportation: 1 day, demand: ${
      demandData.processors.demand_kg
    } kg, price: PHP ${demandData.processors.price_per_kg}/kg)
    - Exporters (transportation: 2 days, demand: ${
      demandData.exporters.demand_kg
    } kg, price: PHP ${demandData.exporters.price_per_kg}/kg)
    
    Focus on minimizing spoilage and maximizing profit.
    `;

    // In a real system, we'd call an AI service here
    // For now, we'll generate a simple recommendation
    const aiRecommendations = await generateRecommendations(
      batches,
      demandData
    );

    res.status(200).json({
      success: true,
      data: {
        batches,
        demand_data: demandData,
        recommendations: aiRecommendations,
      },
    });
  } catch (error) {
    console.log("Error in getDistributionRecommendations function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Mock function to generate recommendations
// In a real system, this would call the AI service
async function generateRecommendations(batches, demandData) {
  try {
    // Try to get AI recommendations if the service is available
    const aiResponse = await generateContent(
      "distribution recommendation",
      `Generate distribution recommendations for ${batches.length} batches of Cavendish bananas`
    );

    if (aiResponse && aiResponse.recommendations) {
      return aiResponse.recommendations;
    }
  } catch (error) {
    console.log(
      "Error calling AI service, falling back to rule-based recommendations",
      error
    );
  }

  // Fall back to rule-based recommendations
  const highRiskBatches = batches.filter(
    (b) => b.spoilage_risk === "high" || b.days_remaining <= 2
  );
  const mediumRiskBatches = batches.filter(
    (b) =>
      (b.spoilage_risk === "medium" ||
        (b.days_remaining > 2 && b.days_remaining <= 5)) &&
      b.spoilage_risk !== "high" &&
      b.days_remaining > 2
  );
  const lowRiskBatches = batches.filter(
    (b) => b.spoilage_risk === "low" && b.days_remaining > 5
  );

  const totalHighRiskKg = highRiskBatches.reduce(
    (sum, b) => sum + b.quantity_kg,
    0
  );
  const totalMediumRiskKg = mediumRiskBatches.reduce(
    (sum, b) => sum + b.quantity_kg,
    0
  );
  const totalLowRiskKg = lowRiskBatches.reduce(
    (sum, b) => sum + b.quantity_kg,
    0
  );

  // Allocation logic
  const recommendations = [];

  // High risk batches go to local markets and processors (shortest transportation time)
  if (totalHighRiskKg > 0) {
    recommendations.push({
      priority: "URGENT - Same Day Distribution",
      description: `Distribute ${totalHighRiskKg} kg of high-risk bananas immediately`,
      allocation: {
        local_markets: Math.min(
          totalHighRiskKg * 0.7,
          demandData.local_markets.demand_kg
        ),
        processors: Math.min(
          totalHighRiskKg * 0.3,
          demandData.processors.demand_kg
        ),
      },
      batches: highRiskBatches.map((b) => b.id),
      reason:
        "These batches have high spoilage risk or very short remaining shelf life",
    });
  }

  // Medium risk batches go to supermarkets and remaining local markets
  if (totalMediumRiskKg > 0) {
    recommendations.push({
      priority: "HIGH - Next Day Distribution",
      description: `Distribute ${totalMediumRiskKg} kg of medium-risk bananas within 1-2 days`,
      allocation: {
        supermarkets: Math.min(
          totalMediumRiskKg * 0.6,
          demandData.supermarkets.demand_kg
        ),
        local_markets: Math.min(
          totalMediumRiskKg * 0.4,
          Math.max(
            0,
            demandData.local_markets.demand_kg - totalHighRiskKg * 0.7
          )
        ),
      },
      batches: mediumRiskBatches.map((b) => b.id),
      reason:
        "These batches have medium spoilage risk or moderate remaining shelf life",
    });
  }

  // Low risk batches can go to exporters and remaining supermarkets
  if (totalLowRiskKg > 0) {
    recommendations.push({
      priority: "NORMAL - Strategic Distribution",
      description: `Distribute ${totalLowRiskKg} kg of low-risk bananas within 3-4 days`,
      allocation: {
        exporters: Math.min(
          totalLowRiskKg * 0.8,
          demandData.exporters.demand_kg
        ),
        supermarkets: Math.min(
          totalLowRiskKg * 0.2,
          Math.max(
            0,
            demandData.supermarkets.demand_kg - totalMediumRiskKg * 0.6
          )
        ),
      },
      batches: lowRiskBatches.map((b) => b.id),
      reason:
        "These batches have low spoilage risk and longer remaining shelf life",
    });
  }

  // Calculate total potential revenue
  let totalRevenue = 0;
  for (const rec of recommendations) {
    for (const [channel, quantity] of Object.entries(rec.allocation)) {
      totalRevenue += quantity * demandData[channel].price_per_kg;
    }
  }

  return {
    recommendations,
    total_potential_revenue_php: totalRevenue,
    summary: `Distribute high-risk batches (${totalHighRiskKg} kg) immediately to local markets and processors. 
    Send medium-risk batches (${totalMediumRiskKg} kg) to supermarkets within 1-2 days. 
    Reserve low-risk batches (${totalLowRiskKg} kg) for export and remaining supermarket demand.`,
  };
}

// Get inventory analytics
export const getInventoryAnalytics = async (req, res) => {
  try {
    // Inventory trends over time (30 days)
    const inventoryTrends = await sql`
      WITH dates AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date as date
      )
      SELECT 
        d.date,
        COALESCE(SUM(il.quantity_kg) FILTER (WHERE il.action = 'addition'), 0) as additions,
        COALESCE(SUM(il.quantity_kg) FILTER (WHERE il.action = 'removal'), 0) as removals
      FROM dates d
      LEFT JOIN inventory_logs il ON DATE(il.created_at) = d.date
      GROUP BY d.date
      ORDER BY d.date
    `;

    // Calculate daily balance
    let runningBalance = 0; // We'd need the starting balance from somewhere
    const trendsWithBalance = inventoryTrends.map((day) => {
      runningBalance = runningBalance + day.additions - day.removals;
      return {
        ...day,
        balance: runningBalance,
      };
    });

    // Current inventory by quality grade
    const inventoryByGrade = await sql`
      SELECT 
        quality_grade,
        COUNT(*) as batch_count,
        SUM(quantity_kg) as total_kg
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
      GROUP BY quality_grade
      ORDER BY quality_grade
    `;

    // Spoilage risk distribution
    const spoilageDistribution = await sql`
      SELECT 
        spoilage_risk,
        COUNT(*) as batch_count,
        SUM(quantity_kg) as total_kg
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
      GROUP BY spoilage_risk
      ORDER BY 
        CASE 
          WHEN spoilage_risk = 'high' THEN 1
          WHEN spoilage_risk = 'medium' THEN 2
          WHEN spoilage_risk = 'low' THEN 3
          ELSE 4
        END
    `;

    // Shelf life distribution
    const shelfLifeDistribution = await sql`
      SELECT 
        CASE
          WHEN EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= 2 THEN '0-2 days'
          WHEN EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= 5 THEN '3-5 days'
          WHEN EXTRACT(DAY FROM (harvest_date + (estimated_shelf_life || ' days')::INTERVAL) - CURRENT_DATE) <= 8 THEN '6-8 days'
          ELSE '9+ days'
        END as remaining_shelf_life,
        COUNT(*) as batch_count,
        SUM(quantity_kg) as total_kg
      FROM batches
      WHERE status IN ('in_storage', 'pending_shipment')
      GROUP BY remaining_shelf_life
      ORDER BY 
        CASE
          WHEN remaining_shelf_life = '0-2 days' THEN 1
          WHEN remaining_shelf_life = '3-5 days' THEN 2
          WHEN remaining_shelf_life = '6-8 days' THEN 3
          WHEN remaining_shelf_life = '9+ days' THEN 4
        END
    `;

    res.status(200).json({
      success: true,
      data: {
        inventory_trends: trendsWithBalance,
        inventory_by_grade: inventoryByGrade,
        spoilage_distribution: spoilageDistribution,
        shelf_life_distribution: shelfLifeDistribution,
      },
    });
  } catch (error) {
    console.log("Error in getInventoryAnalytics function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get shipment analytics and tracking
export const getShipmentAnalytics = async (req, res) => {
  try {
    // Shipment status summary
    const shipmentSummary = await sql`
      SELECT 
        status,
        COUNT(*) as shipment_count,
        SUM(b.quantity_kg) as total_kg
      FROM shipments s
      JOIN batches b ON s.batch_id = b.id
      GROUP BY status
      ORDER BY 
        CASE 
          WHEN status = 'scheduled' THEN 1
          WHEN status = 'in_transit' THEN 2
          WHEN status = 'delivered' THEN 3
          WHEN status = 'cancelled' THEN 4
          ELSE 5
        END
    `;

    // Destination distribution
    const destinationDistribution = await sql`
      SELECT 
        destination,
        COUNT(*) as shipment_count,
        SUM(b.quantity_kg) as total_kg
      FROM shipments s
      JOIN batches b ON s.batch_id = b.id
      GROUP BY destination
      ORDER BY total_kg DESC
    `;

    // Recent shipments
    const recentShipments = await sql`
      SELECT 
        s.*,
        b.variety,
        b.quantity_kg,
        b.quality_grade
      FROM shipments s
      JOIN batches b ON s.batch_id = b.id
      ORDER BY s.created_at DESC
      LIMIT 10
    `;

    // Transportation type usage
    const transportationTypes = await sql`
      SELECT 
        transportation_type,
        COUNT(*) as shipment_count,
        SUM(b.quantity_kg) as total_kg
      FROM shipments s
      JOIN batches b ON s.batch_id = b.id
      GROUP BY transportation_type
      ORDER BY total_kg DESC
    `;

    res.status(200).json({
      success: true,
      data: {
        shipment_summary: shipmentSummary,
        destination_distribution: destinationDistribution,
        recent_shipments: recentShipments,
        transportation_types: transportationTypes,
      },
    });
  } catch (error) {
    console.log("Error in getShipmentAnalytics function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Get recommendations for optimal storage conditions
export const getStorageRecommendations = async (req, res) => {
  try {
    // Get current storage conditions
    const currentConditions = await sql`
      SELECT 
        storage_location,
        AVG(temperature_actual) as avg_temperature,
        AVG(humidity_actual) as avg_humidity,
        COUNT(*) as batch_count,
        SUM(quantity_kg) as total_kg
      FROM batches
      WHERE 
        status IN ('in_storage', 'pending_shipment')
        AND temperature_actual IS NOT NULL
        AND humidity_actual IS NOT NULL
      GROUP BY storage_location
    `;

    // Define optimal conditions for Cavendish bananas
    const optimalConditions = {
      temperature: {
        min: 13,
        max: 15,
        ideal: 14,
        unit: "°C",
      },
      humidity: {
        min: 90,
        max: 95,
        ideal: 92,
        unit: "%",
      },
    };

    // Generate recommendations
    const recommendations = currentConditions.map((location) => {
      const tempDeviation = Math.abs(
        location.avg_temperature - optimalConditions.temperature.ideal
      );
      const humidDeviation = Math.abs(
        location.avg_humidity - optimalConditions.humidity.ideal
      );

      let tempAdjustment = 0;
      let humidAdjustment = 0;
      let tempRecommendation = "Temperature is within optimal range.";
      let humidRecommendation = "Humidity is within optimal range.";

      // Temperature recommendations
      if (location.avg_temperature < optimalConditions.temperature.min) {
        tempAdjustment =
          optimalConditions.temperature.ideal - location.avg_temperature;
        tempRecommendation = `Increase temperature by ${tempAdjustment.toFixed(
          1
        )}${optimalConditions.temperature.unit}`;
      } else if (location.avg_temperature > optimalConditions.temperature.max) {
        tempAdjustment =
          location.avg_temperature - optimalConditions.temperature.ideal;
        tempRecommendation = `Decrease temperature by ${tempAdjustment.toFixed(
          1
        )}${optimalConditions.temperature.unit}`;
      }

      // Humidity recommendations
      if (location.avg_humidity < optimalConditions.humidity.min) {
        humidAdjustment =
          optimalConditions.humidity.ideal - location.avg_humidity;
        humidRecommendation = `Increase humidity by ${humidAdjustment.toFixed(
          1
        )}${optimalConditions.humidity.unit}`;
      } else if (location.avg_humidity > optimalConditions.humidity.max) {
        humidAdjustment =
          location.avg_humidity - optimalConditions.humidity.ideal;
        humidRecommendation = `Decrease humidity by ${humidAdjustment.toFixed(
          1
        )}${optimalConditions.humidity.unit}`;
      }

      // Calculate risk level based on deviations
      let riskLevel = "low";
      if (tempDeviation > 3 || humidDeviation > 10) {
        riskLevel = "high";
      } else if (tempDeviation > 1 || humidDeviation > 5) {
        riskLevel = "medium";
      }

      return {
        storage_location: location.storage_location,
        current_conditions: {
          temperature: location.avg_temperature,
          humidity: location.avg_humidity,
        },
        optimal_conditions: optimalConditions,
        deviations: {
          temperature: tempDeviation,
          humidity: humidDeviation,
        },
        recommendations: {
          temperature: tempRecommendation,
          humidity: humidRecommendation,
        },
        risk_level: riskLevel,
        affected_inventory_kg: location.total_kg,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        storage_recommendations: recommendations,
        optimal_conditions: optimalConditions,
        summary: `Maintain temperature at ${optimalConditions.temperature.ideal}${optimalConditions.temperature.unit} (range: ${optimalConditions.temperature.min}-${optimalConditions.temperature.max}${optimalConditions.temperature.unit}) and humidity at ${optimalConditions.humidity.ideal}${optimalConditions.humidity.unit} (range: ${optimalConditions.humidity.min}-${optimalConditions.humidity.max}${optimalConditions.humidity.unit}) for optimal Cavendish banana storage.`,
      },
    });
  } catch (error) {
    console.log("Error in getStorageRecommendations function", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
