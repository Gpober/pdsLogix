// ========================================
// FIXED PAYROLL SUBMIT API ROUTE
// File: /app/api/payroll/submit/route.ts
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { location_id, pay_date, payroll_group, submitted_by, employees } = body;

    // Validation
    if (!location_id || !pay_date || !payroll_group || !submitted_by || !employees?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ FIX: Get organization_id from the location
    const { data: locationData, error: locationError } = await supabase
      .from('locations')
      .select('organization_id')
      .eq('id', location_id)
      .single();

    if (locationError || !locationData) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      );
    }

    const organization_id = locationData.organization_id;

    // Calculate period dates (14-day period ending 9 days before pay date)
    const payDateObj = new Date(pay_date);
    const periodEnd = new Date(payDateObj);
    periodEnd.setDate(payDateObj.getDate() - 9);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodEnd.getDate() - 13);

    const total_amount = employees.reduce((sum: number, emp: any) => sum + (emp.amount || 0), 0);

    // Create submission
    const { data: submission, error: submissionError } = await supabase
      .from('payroll_submissions')
      .insert([
        {
          organization_id,  // ✅ Add organization_id here too
          location_id,
          pay_date,
          payroll_group,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          total_amount,
          employee_count: employees.length,
          submitted_by,
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { error: 'Failed to create submission', details: submissionError.message },
        { status: 500 }
      );
    }

    // ✅ FIX: Create payroll entries WITH organization_id
    const entries = employees.map((emp: any) => ({
      organization_id,      // ✅ ADD THIS!
      submission_id: submission.id,
      employee_id: emp.employee_id,
      hours: emp.hours,
      units: emp.units,
      amount: emp.amount,
      notes: emp.notes,
      status: 'pending',
    }));

    const { error: entriesError } = await supabase
      .from('payroll_entries')
      .insert(entries);

    if (entriesError) {
      console.error('Entries error:', entriesError);
      
      // Rollback: delete the submission since entries failed
      await supabase
        .from('payroll_submissions')
        .delete()
        .eq('id', submission.id);

      return NextResponse.json(
        { error: 'Failed to create payroll entries', details: entriesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      submission_number: submission.id.substring(0, 8),
    });

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
