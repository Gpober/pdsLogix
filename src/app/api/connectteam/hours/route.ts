// src/app/api/connecteam/hours/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { periodStart, periodEnd, employeeEmails } = await request.json();

    if (!periodStart || !periodEnd || !employeeEmails) {
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

    // Call Connecteam Timesheets API
    // Reference: https://developers.connecteam.com/reference/timesheets
    const response = await fetch('https://api.connecteam.com/timesheets/v1/timesheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: periodStart,
        endDate: periodEnd,
        includeBreaks: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Connecteam API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch hours from Connecteam' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Process the timesheets data
    // Map Connecteam data to our employee hours format
    const hoursMap: Record<string, number> = {};

    // Connecteam returns timesheets with user info
    if (data.timesheets && Array.isArray(data.timesheets)) {
      data.timesheets.forEach((timesheet: any) => {
        const email = timesheet.user?.email?.toLowerCase();
        if (email && employeeEmails.includes(email)) {
          // Sum up hours for this employee
          const hours = timesheet.totalHours || 0;
          hoursMap[email] = (hoursMap[email] || 0) + hours;
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
