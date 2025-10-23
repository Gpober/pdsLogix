// src/app/api/connecteam/hours/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // TEMPORARY DEBUG - REMOVE AFTER TESTING
    console.log('🔑 API Key exists:', !!process.env.CONNECTEAM_API_KEY);
    console.log('🔑 API Key length:', process.env.CONNECTEAM_API_KEY?.length);
    console.log('🔑 API Key starts with:', process.env.CONNECTEAM_API_KEY?.substring(0, 10));
    
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = await request.json();
    // ... rest of code

export async function POST(request: NextRequest) {
  try {
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = await request.json();

    if (!periodStart || !periodEnd || !employeeEmails || !payrollGroup) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const apiKey = process.env.CONNECTEAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Connecteam API key not configured' },
        { status: 500 }
      );
    }

    // Select the correct time clock based on payroll group
    const timeClockId = payrollGroup === 'A' 
      ? process.env.CONNECTEAM_TIME_CLOCK_ID_A 
      : process.env.CONNECTEAM_TIME_CLOCK_ID_B;
      
    if (!timeClockId) {
      return NextResponse.json(
        { error: `Connecteam Time Clock ID not configured for Payroll Group ${payrollGroup}` },
        { status: 500 }
      );
    }

    // Call Connecteam Time Clock API to get timesheet totals
    // Reference: https://developer.connecteam.com/time-clock/v1/time-clocks/{timeClockId}/timesheet
    const response = await fetch(
      `https://api.connecteam.com/time-clock/v1/time-clocks/${timeClockId}/timesheet?startDate=${periodStart}&endDate=${periodEnd}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Connecteam API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch hours from Connecteam' },
        { status: response.status }
      );
    }

    const timesheetData = await response.json();

    // Step 1: Get all users to map userId to email
    const usersResponse = await fetch('https://api.connecteam.com/users/v1/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!usersResponse.ok) {
      console.error('Failed to fetch users from Connecteam');
      return NextResponse.json(
        { error: 'Failed to fetch user data from Connecteam' },
        { status: usersResponse.status }
      );
    }

    const usersData = await usersResponse.json();
    
    // Create userId -> email mapping
    const userIdToEmail: Record<number, string> = {};
    if (usersData.data && Array.isArray(usersData.data)) {
      usersData.data.forEach((user: any) => {
        if (user.id && user.email) {
          userIdToEmail[user.id] = user.email.toLowerCase();
        }
      });
    }

    // Step 2: Process timesheet data and map to emails
    const hoursMap: Record<string, number> = {};

    if (timesheetData.data && timesheetData.data.users && Array.isArray(timesheetData.data.users)) {
      timesheetData.data.users.forEach((userRecord: any) => {
        const userId = userRecord.userId;
        const email = userIdToEmail[userId];
        
        if (email && employeeEmails.includes(email)) {
          // Sum up daily hours for this user
          let totalHours = 0;
          if (userRecord.dailyRecords && Array.isArray(userRecord.dailyRecords)) {
            userRecord.dailyRecords.forEach((day: any) => {
              totalHours += day.dailyTotalWorkHours || 0;
            });
          }
          hoursMap[email] = totalHours;
        }
      });
    }

    return NextResponse.json({
      success: true,
      hours: hoursMap,
      period: { start: periodStart, end: periodEnd },
    });

  } catch (error) {
    console.error('Error fetching Connecteam hours:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
