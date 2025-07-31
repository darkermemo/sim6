// Script to fix the dashboard token issue
// Run this in the browser console on the SIEM UI page

// The new valid token that works with the backend
const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi11c2VyIiwidGVuYW50X2lkIjoidGVuYW50LUEiLCJyb2xlcyI6WyJBZG1pbiJdLCJpYXQiOjE3NTM5NjU1OTgsImV4cCI6MTc1Mzk2OTE5OCwiaXNzIjoic2llbS1hdXRoIiwiYXVkIjoic2llbS1zZWFyY2giLCJqdGkiOiJ0ZXN0LXNlc3Npb24tMTIzIn0.w7Cs8Ean6-YbcT5cyszKO4ynd5zN68j8ayfi6RvmiXc';

// Update localStorage
localStorage.setItem('access_token', validToken);
console.log('✅ Token updated in localStorage');
console.log('New token:', validToken);

// Test the dashboard API directly
async function testDashboardAPI() {
    try {
        const response = await fetch('/api/v1/dashboard', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${validToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Dashboard API test successful:', data);
            return data;
        } else {
            console.error('❌ Dashboard API test failed:', response.status, await response.text());
        }
    } catch (error) {
        console.error('❌ Dashboard API request error:', error);
    }
}

// Run the test
testDashboardAPI();

// Instructions
console.log('\n📋 Instructions:');
console.log('1. The token has been updated in localStorage');
console.log('2. Refresh the page to see if the Dashboard V2 API error is resolved');
console.log('3. Check the Dashboard component for successful data loading');