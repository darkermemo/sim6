#!/usr/bin/env node

// Test script to verify API routing
const https = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0X3VzZXIiLCJ0ZW5hbnRfaWQiOiJkZWZhdWx0Iiwicm9sZXMiOlsidXNlciJdLCJpYXQiOjE3NTM5NTYzMDUsImV4cCI6MTc1Mzk1OTkwNSwiaXNzIjoic2llbS1hdXRoIiwiYXVkIjoic2llbS1zZWFyY2giLCJqdGkiOiJ0ZXN0LXRva2VuLWlkIn0.JVJTZqVMefZTFP3LBNEaWRsC3Fz90gxaC3_Qr50wTTU';

function testEndpoint(url, description) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    console.log(`\n=== Testing ${description} ===`);
    console.log(`URL: ${url}`);
    
    const req = https.request(url, options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Response: ${data}`);
        resolve({ status: res.statusCode, data });
      });
    });
    
    req.on('error', (err) => {
      console.log(`Error: ${err.message}`);
      reject(err);
    });
    
    req.end();
  });
}

async function runTests() {
  try {
    // Test direct Rust backend
    await testEndpoint('http://localhost:8084/api/v1/dashboard', 'Direct Rust Backend');
    
    // Test through Vite proxy
    await testEndpoint('http://localhost:3001/api/v1/dashboard', 'Vite Proxy to Rust');
    
    // Test through Node.js proxy
    await testEndpoint('http://localhost:8090/api/v1/dashboard', 'Node.js Proxy');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();