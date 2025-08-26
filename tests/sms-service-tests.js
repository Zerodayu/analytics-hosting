import { sendSMS, sendSpoilageAlert, sendDistributionAlert } from '../backend/services/smsService.js';

const testSMSService = async () => {
  try {
    console.log('🚀 Starting SMS Service tests...');
    
    // Test basic SMS sending
    console.log('\nTesting basic SMS sending...');
    const phoneNumber = '+1234567890'; // Test phone number
    const message = 'This is a test SMS from AniLytics';
    
    const smsResult = await sendSMS(phoneNumber, message);
    console.log('✅ Basic SMS result:', smsResult);
    
    // Test spoilage alert
    console.log('\nTesting spoilage alert...');
    const batchData = {
      id: 12345,
      variety: 'Cavendish',
      quantity_kg: 100,
      storage_location: 'Zone A',
      days_remaining: 2,
      spoilage_risk: 'high'
    };
    
    const spoilageResult = await sendSpoilageAlert(batchData, phoneNumber);
    console.log('✅ Spoilage alert result:', spoilageResult);
    
    // Test distribution alert
    console.log('\nTesting distribution alert...');
    const recommendation = {
      priority: 'HIGH',
      description: 'Distribute batches to local market',
      reason: 'High spoilage risk and market demand',
      batches: [{ id: 12345, quantity_kg: 100 }],
      allocation: {
        'Local Market': 75,
        'Supermarket Chain': 25
      }
    };
    
    const distributionResult = await sendDistributionAlert(recommendation, phoneNumber);
    console.log('✅ Distribution alert result:', distributionResult);
    
    console.log('\n✅ SMS Service tests completed successfully!');
    
  } catch (error) {
    console.error('❌ SMS Service test error:', error.message);
    console.error(error.stack);
  }
};

// Run the tests
testSMSService();
