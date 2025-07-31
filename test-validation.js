const axios = require('axios');

// Simple validation test
async function testValidation() {
  try {
    console.log('Testing API response validation...');
    
    const response = await axios.get('http://localhost:3000/api/v1/dashboard');
    console.log('API Response:', JSON.stringify(response.data, null, 2));
    
    // Check data types
    const data = response.data;
    console.log('\nData type validation:');
    console.log('total_events type:', typeof data.total_events, 'value:', data.total_events);
    console.log('total_alerts type:', typeof data.total_alerts, 'value:', data.total_alerts);
    console.log('alerts_over_time type:', Array.isArray(data.alerts_over_time), 'length:', data.alerts_over_time?.length);
    console.log('top_log_sources type:', Array.isArray(data.top_log_sources), 'length:', data.top_log_sources?.length);
    console.log('recent_alerts type:', Array.isArray(data.recent_alerts), 'length:', data.recent_alerts?.length);
    
    // Check for any unexpected fields
    const expectedFields = ['total_events', 'total_alerts', 'alerts_over_time', 'top_log_sources', 'recent_alerts'];
    const actualFields = Object.keys(data);
    console.log('\nField comparison:');
    console.log('Expected fields:', expectedFields);
    console.log('Actual fields:', actualFields);
    
    const unexpectedFields = actualFields.filter(field => !expectedFields.includes(field));
    const missingFields = expectedFields.filter(field => !actualFields.includes(field));
    
    if (unexpectedFields.length > 0) {
      console.log('Unexpected fields:', unexpectedFields);
    }
    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields);
    }
    
  } catch (error) {
    console.error('Error testing validation:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testValidation();