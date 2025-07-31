// Test script to verify dashboard API fix
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc2NzI3NjAwMCwiaWF0IjoxNzM1NzQwMDAwLCJyb2xlIjoiYWRtaW4iLCJ0ZW5hbnRfaWQiOiJ0ZW5hbnQxIn0.abc123';

async function testDashboardAPI() {
  try {
    console.log('Testing dashboard API...');
    
    const response = await fetch('http://localhost:3001/api/v1/dashboard', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('Dashboard data received:', JSON.stringify(data, null, 2));
      console.log('✅ Dashboard API test successful!');
    } else {
      const errorText = await response.text();
      console.log('❌ Dashboard API test failed:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ Dashboard API test error:', error.message);
  }
}

testDashboardAPI();