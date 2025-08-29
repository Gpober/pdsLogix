"use client";

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Download, RefreshCw, Plus, X, ChevronDown, ChevronRight, 
  ArrowUp, ArrowDown, TrendingUp, DollarSign, PieChart, BarChart3, 
  Users, UserPlus, UserCheck, UserX, Settings, Bell, Search, Filter,
  Building2, Key, Wrench, CreditCard, AlertTriangle, CheckCircle,
  FileText, Calculator, Receipt, Clock, Edit3, Trash2, Eye,
  MapPin, Phone, Mail, Briefcase, Award, Target
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart as RechartsPieChart, Cell, Pie, AreaChart, Area,
  ComposedChart
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',      // Your brand blue
  secondary: '#3A9BD1',    // Darker shade of your blue
  tertiary: '#7CC4ED',     // Lighter shade of your blue
  accent: '#2E86C1',       // Deep blue accent
  success: '#27AE60',      // Professional green
  warning: '#F39C12',      // Professional orange
  danger: '#E74C3C',       // Professional red
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A'
  }
};

// Type definitions
interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  employeeType: 'full-time' | 'part-time' | 'contractor';
  payType: 'salary' | 'hourly';
  salary?: number;
  hourlyRate?: number;
  startDate: string;
  status: 'active' | 'inactive' | 'terminated';
  address: string;
  taxId: string;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  benefits: {
    healthInsurance: boolean;
    dentalInsurance: boolean;
    retirement401k: boolean;
    paidTimeOff: number;
  };
}

interface PayrollRun {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  status: 'draft' | 'processing' | 'completed' | 'cancelled';
  totalEmployees: number;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  totalTaxes: number;
}

interface PayStub {
  id: string;
  employeeId: string;
  payrollRunId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  hoursWorked?: number;
  overtimeHours?: number;
  grossPay: number;
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  healthInsurance: number;
  retirement401k: number;
  otherDeductions: number;
  netPay: number;
}

interface TaxLiability {
  id: string;
  taxType: 'federal' | 'state' | 'local' | 'unemployment' | 'workers-comp';
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  quarter: string;
  year: number;
}

interface NotificationState {
  show: boolean;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface NewEmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  employeeType: 'full-time' | 'part-time' | 'contractor';
  payType: 'salary' | 'hourly';
  salary: string;
  hourlyRate: string;
  startDate: string;
  address: string;
  taxId: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  healthInsurance: boolean;
  dentalInsurance: boolean;
  retirement401k: boolean;
  paidTimeOff: string;
}

interface Payment {
  id: number;
  last_name: string;
  first_name: string;
  department: string;
  payment_method: string;
  date: string;
  total_amount: number;
}

// I AM CFO Logo Component
const IAMCFOLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`${className} flex items-center justify-center relative`}>
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <circle cx="60" cy="60" r="55" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2"/>
      <circle cx="60" cy="60" r="42" fill={BRAND_COLORS.primary}/>
      <g fill="white">
        <rect x="35" y="70" width="6" height="15" rx="1"/>
        <rect x="44" y="65" width="6" height="20" rx="1"/>
        <rect x="53" y="55" width="6" height="30" rx="1"/>
        <rect x="62" y="50" width="6" height="35" rx="1"/>
        <rect x="71" y="60" width="6" height="25" rx="1"/>
        <rect x="80" y="45" width="6" height="40" rx="1"/>
        <path d="M35 72 L44 67 L53 57 L62 52 L71 62 L80 47" 
              stroke="#FFFFFF" strokeWidth="2.5" fill="none"/>
        <circle cx="35" cy="72" r="2.5" fill="#FFFFFF"/>
        <circle cx="44" cy="67" r="2.5" fill="#FFFFFF"/>
        <circle cx="53" cy="57" r="2.5" fill="#FFFFFF"/>
        <circle cx="62" cy="52" r="2.5" fill="#FFFFFF"/>
        <circle cx="71" cy="62" r="2.5" fill="#FFFFFF"/>
        <circle cx="80" cy="47" r="2.5" fill="#FFFFFF"/>
      </g>
      <text x="60" y="95" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial, sans-serif">CFO</text>
    </svg>
  </div>
);

export default function PayrollPage() {
  // State management
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'payroll-runs' | 'tax-center'>('overview');
  const [notification, setNotification] = useState<NotificationState>({ show: false, message: '', type: 'info' });
  const [newEmployeeModalOpen, setNewEmployeeModalOpen] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('monthly');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [newEmployeeForm, setNewEmployeeForm] = useState<NewEmployeeForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    employeeType: 'full-time',
    payType: 'salary',
    salary: '',
    hourlyRate: '',
    startDate: '',
    address: '',
    taxId: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    healthInsurance: false,
    dentalInsurance: false,
    retirement401k: false,
    paidTimeOff: '15'
  });

  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;
        setPayments(data || []);
      } catch (err: any) {
        setPaymentsError(err.message);
      } finally {
        setPaymentsLoading(false);
      }
    };

    fetchPayments();
  }, []);

  // Sample data
  const employees: Employee[] = [
    {
      id: '1',
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@company.com',
      phone: '(555) 123-4567',
      position: 'Property Manager',
      department: 'Operations',
      employeeType: 'full-time',
      payType: 'salary',
      salary: 75000,
      startDate: '2023-01-15',
      status: 'active',
      address: '123 Main St, Miami, FL 33101',
      taxId: '123-45-6789',
      emergencyContact: {
        name: 'John Johnson',
        phone: '(555) 987-6543',
        relationship: 'Spouse'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        retirement401k: true,
        paidTimeOff: 20
      }
    },
    {
      id: '2',
      firstName: 'Michael',
      lastName: 'Rodriguez',
      email: 'michael.rodriguez@company.com',
      phone: '(555) 234-5678',
      position: 'Maintenance Supervisor',
      department: 'Maintenance',
      employeeType: 'full-time',
      payType: 'hourly',
      hourlyRate: 28.50,
      startDate: '2022-08-22',
      status: 'active',
      address: '456 Oak Ave, Miami, FL 33102',
      taxId: '234-56-7890',
      emergencyContact: {
        name: 'Maria Rodriguez',
        phone: '(555) 876-5432',
        relationship: 'Spouse'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: false,
        retirement401k: true,
        paidTimeOff: 15
      }
    },
    {
      id: '3',
      firstName: 'Emily',
      lastName: 'Chen',
      email: 'emily.chen@company.com',
      phone: '(555) 345-6789',
      position: 'Cleaning Coordinator',
      department: 'Housekeeping',
      employeeType: 'part-time',
      payType: 'hourly',
      hourlyRate: 22.00,
      startDate: '2023-03-10',
      status: 'active',
      address: '789 Pine St, Miami, FL 33103',
      taxId: '345-67-8901',
      emergencyContact: {
        name: 'David Chen',
        phone: '(555) 765-4321',
        relationship: 'Brother'
      },
      benefits: {
        healthInsurance: false,
        dentalInsurance: false,
        retirement401k: false,
        paidTimeOff: 10
      }
    },
    {
      id: '4',
      firstName: 'Robert',
      lastName: 'Thompson',
      email: 'robert.thompson@contractor.com',
      phone: '(555) 456-7890',
      position: 'Marketing Consultant',
      department: 'Marketing',
      employeeType: 'contractor',
      payType: 'hourly',
      hourlyRate: 85.00,
      startDate: '2023-06-01',
      status: 'active',
      address: '321 Elm St, Miami, FL 33104',
      taxId: '456-78-9012',
      emergencyContact: {
        name: 'Lisa Thompson',
        phone: '(555) 654-3210',
        relationship: 'Spouse'
      },
      benefits: {
        healthInsurance: false,
        dentalInsurance: false,
        retirement401k: false,
        paidTimeOff: 0
      }
    },
    {
      id: '5',
      firstName: 'Amanda',
      lastName: 'Williams',
      email: 'amanda.williams@company.com',
      phone: '(555) 567-8901',
      position: 'Bookkeeper',
      department: 'Finance',
      employeeType: 'full-time',
      payType: 'salary',
      salary: 58000,
      startDate: '2022-11-14',
      status: 'active',
      address: '654 Maple Dr, Miami, FL 33105',
      taxId: '567-89-0123',
      emergencyContact: {
        name: 'James Williams',
        phone: '(555) 543-2109',
        relationship: 'Father'
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        retirement401k: true,
        paidTimeOff: 18
      }
    }
  ];

  const payrollRuns: PayrollRun[] = [
    {
      id: '1',
      payPeriodStart: '2025-06-16',
      payPeriodEnd: '2025-06-30',
      payDate: '2025-07-05',
      status: 'processing',
      totalEmployees: 5,
      totalGrossPay: 18750,
      totalDeductions: 4125,
      totalNetPay: 14625,
      totalTaxes: 3250
    },
    {
      id: '2',
      payPeriodStart: '2025-06-01',
      payPeriodEnd: '2025-06-15',
      payDate: '2025-06-20',
      status: 'completed',
      totalEmployees: 5,
      totalGrossPay: 17950,
      totalDeductions: 3950,
      totalNetPay: 14000,
      totalTaxes: 3125
    },
    {
      id: '3',
      payPeriodStart: '2025-05-16',
      payPeriodEnd: '2025-05-31',
      payDate: '2025-06-05',
      status: 'completed',
      totalEmployees: 4,
      totalGrossPay: 16200,
      totalDeductions: 3560,
      totalNetPay: 12640,
      totalTaxes: 2820
    }
  ];

  const taxLiabilities: TaxLiability[] = [
    {
      id: '1',
      taxType: 'federal',
      amount: 8450,
      dueDate: '2025-07-15',
      status: 'pending',
      quarter: 'Q2',
      year: 2025
    },
    {
      id: '2',
      taxType: 'state',
      amount: 3200,
      dueDate: '2025-07-15',
      status: 'pending',
      quarter: 'Q2',
      year: 2025
    },
    {
      id: '3',
      taxType: 'unemployment',
      amount: 1850,
      dueDate: '2025-07-31',
      status: 'pending',
      quarter: 'Q2',
      year: 2025
    }
  ];

  const departments = ['All Departments', 'Operations', 'Maintenance', 'Housekeeping', 'Marketing', 'Finance'];

  // Utility functions
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const showNotification = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'info' });
    }, 3000);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
      case 'completed':
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'processing':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
      case 'cancelled':
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'terminated':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getFilteredEmployees = () => {
    return employees.filter(employee => {
      const matchesDepartment = departmentFilter === 'All Departments' || employee.department === departmentFilter;
      const matchesSearch = searchTerm === '' || 
        `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesDepartment && matchesSearch;
    });
  };

  const calculatePayrollSummary = () => {
    const activeEmployees = employees.filter(emp => emp.status === 'active');
    const totalEmployees = activeEmployees.length;
    
    const monthlyPayroll = activeEmployees.reduce((sum, emp) => {
      if (emp.payType === 'salary' && emp.salary) {
        return sum + (emp.salary / 12);
      } else if (emp.payType === 'hourly' && emp.hourlyRate) {
        // Assuming 160 hours per month for full-time, 80 for part-time
        const hoursPerMonth = emp.employeeType === 'full-time' ? 160 : 80;
        return sum + (emp.hourlyRate * hoursPerMonth);
      }
      return sum;
    }, 0);

    const annualPayroll = monthlyPayroll * 12;
    const quarterlyTaxes = payrollRuns.slice(0, 3).reduce((sum, run) => sum + run.totalTaxes, 0);
    
    return {
      totalEmployees,
      monthlyPayroll,
      annualPayroll,
      quarterlyTaxes,
      avgSalary: totalEmployees > 0 ? annualPayroll / totalEmployees : 0
    };
  };

  const generatePayrollTrendData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return months.map((month, index) => ({
      month,
      grossPay: 16000 + (index * 1000) + Math.random() * 1000,
      netPay: 12000 + (index * 750) + Math.random() * 750,
      taxes: 2800 + (index * 200) + Math.random() * 200,
      deductions: 3500 + (index * 150) + Math.random() * 150
    }));
  };

  const generateDepartmentCostData = () => {
    const deptData = departments.slice(1).map(dept => {
      const deptEmployees = employees.filter(emp => emp.department === dept);
      const monthlyCost = deptEmployees.reduce((sum, emp) => {
        if (emp.payType === 'salary' && emp.salary) {
          return sum + (emp.salary / 12);
        } else if (emp.payType === 'hourly' && emp.hourlyRate) {
          const hoursPerMonth = emp.employeeType === 'full-time' ? 160 : 80;
          return sum + (emp.hourlyRate * hoursPerMonth);
        }
        return sum;
      }, 0);
      
      return {
        department: dept,
        cost: monthlyCost,
        employees: deptEmployees.length
      };
    });
    
    return deptData;
  };

  const handleNewEmployee = () => {
    if (!newEmployeeForm.firstName || !newEmployeeForm.lastName || !newEmployeeForm.email || 
        !newEmployeeForm.position || !newEmployeeForm.department || !newEmployeeForm.startDate) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    // In a real app, this would create the employee in the backend
    showNotification('Employee added successfully!', 'success');
    setNewEmployeeModalOpen(false);
    setNewEmployeeForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      department: '',
      employeeType: 'full-time',
      payType: 'salary',
      salary: '',
      hourlyRate: '',
      startDate: '',
      address: '',
      taxId: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
      healthInsurance: false,
      dentalInsurance: false,
      retirement401k: false,
      paidTimeOff: '15'
    });
  };

  const payrollSummary = calculatePayrollSummary();
  const trendData = generatePayrollTrendData();
  const departmentData = generateDepartmentCostData();
  const filteredEmployees = getFilteredEmployees();

  const CHART_COLORS = [BRAND_COLORS.primary, BRAND_COLORS.success, BRAND_COLORS.warning, BRAND_COLORS.danger, BRAND_COLORS.secondary];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header with I AM CFO Branding */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <IAMCFOLogo className="w-8 h-8 mr-4" />
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">I AM CFO</h1>
                <span className="text-sm px-3 py-1 rounded-full text-white" style={{ backgroundColor: BRAND_COLORS.primary }}>
                  Payroll Management
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Complete payroll processing • Tax compliance • Employee management</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Header Controls */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <h2 className="text-3xl font-bold" style={{ color: BRAND_COLORS.primary }}>Payroll Management</h2>
            <div className="flex flex-wrap gap-4 items-center">
              {/* Tab Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    activeTab === 'overview'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{ backgroundColor: activeTab === 'overview' ? BRAND_COLORS.primary : undefined }}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('employees')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    activeTab === 'employees'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{ backgroundColor: activeTab === 'employees' ? BRAND_COLORS.primary : undefined }}
                >
                  Employees
                </button>
                <button
                  onClick={() => setActiveTab('payroll-runs')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    activeTab === 'payroll-runs'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{ backgroundColor: activeTab === 'payroll-runs' ? BRAND_COLORS.primary : undefined }}
                >
                  Payroll Runs
                </button>
                <button
                  onClick={() => setActiveTab('tax-center')}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    activeTab === 'tax-center'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{ backgroundColor: activeTab === 'tax-center' ? BRAND_COLORS.primary : undefined }}
                >
                  Tax Center
                </button>
              </div>

              {/* Action Buttons */}
              <button
                onClick={() => setNewEmployeeModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors shadow-sm"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                <UserPlus className="w-4 h-4" />
                Add Employee
              </button>

              <button
                onClick={() => showNotification('Payroll exported successfully', 'success')}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors shadow-sm"
                style={{ backgroundColor: BRAND_COLORS.success }}
              >
                <Download className="w-4 h-4" />
                Export
              </button>

              <button
                onClick={() => showNotification('Payroll data refreshed', 'info')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              {/* Payroll KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.primary }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Total Employees</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{payrollSummary.totalEmployees}</div>
                      <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full inline-block">
                        +1 this month
                      </div>
                    </div>
                    <Users className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.success }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Monthly Payroll</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(payrollSummary.monthlyPayroll)}</div>
                      <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full inline-block">
                        +5.2% vs last month
                      </div>
                    </div>
                    <DollarSign className="w-8 h-8" style={{ color: BRAND_COLORS.success }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.warning }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Average Salary</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(payrollSummary.avgSalary)}</div>
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full inline-block">
                        +2.1% vs last year
                      </div>
                    </div>
                    <TrendingUp className="w-8 h-8" style={{ color: BRAND_COLORS.warning }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.danger }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Quarterly Taxes</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(payrollSummary.quarterlyTaxes)}</div>
                      <div className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full inline-block">
                        Due July 15th
                      </div>
                    </div>
                    <Receipt className="w-8 h-8" style={{ color: BRAND_COLORS.danger }} />
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Payroll Trend */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">6-Month Payroll Trend</h3>
                    <p className="text-sm text-gray-600 mt-1">Gross pay, net pay, taxes, and deductions</p>
                  </div>
                  <div className="p-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value) => [formatCurrency(Number(value)), '']} />
                        <Legend />
                        <Bar dataKey="grossPay" fill={BRAND_COLORS.primary} name="Gross Pay" />
                        <Line type="monotone" dataKey="netPay" stroke={BRAND_COLORS.success} strokeWidth={3} name="Net Pay" />
                        <Area dataKey="taxes" fill={BRAND_COLORS.danger} fillOpacity={0.3} name="Taxes" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Department Cost Breakdown */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">Department Payroll Costs</h3>
                    <p className="text-sm text-gray-600 mt-1">Monthly payroll allocation by department</p>
                  </div>
                  <div className="p-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartsPieChart>
                        <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Monthly Cost']} />
                        <Pie
                          data={departmentData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="cost"
                          label={({ department, percent }) => `${department}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {departmentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Payroll Runs */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">Recent Payroll Runs</h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {payrollRuns.slice(0, 3).map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          <div>
                            <div className="font-medium text-gray-900">
                              {formatDate(run.payPeriodStart)} - {formatDate(run.payPeriodEnd)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {run.totalEmployees} employees • Pay date: {formatDate(run.payDate)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900">{formatCurrency(run.totalNetPay)}</div>
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                              {run.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Upcoming Tax Liabilities */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">Upcoming Tax Liabilities</h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {taxLiabilities.slice(0, 3).map((tax) => (
                        <div key={tax.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          <div>
                            <div className="font-medium text-gray-900 capitalize">
                              {tax.taxType} Tax - {tax.quarter} {tax.year}
                            </div>
                            <div className="text-sm text-gray-600">
                              Due: {formatDate(tax.dueDate)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900">{formatCurrency(tax.amount)}</div>
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tax.status)}`}>
                              {tax.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Payroll Payments */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden lg:col-span-2">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">Payroll Payments</h3>
                  </div>
                  <div className="p-6">
                    {paymentsLoading ? (
                      <p>Loading payments...</p>
                    ) : paymentsError ? (
                      <p className="text-red-600">{paymentsError}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead>
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Employee</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Department</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Method</th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {payments.map((p) => (
                              <tr key={p.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatDate(p.date)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{p.first_name} {p.last_name}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{p.department}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{p.payment_method}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(p.total_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Employees Tab */}
          {activeTab === 'employees' && (
            <>
              {/* Employee Filters */}
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex gap-4 items-center">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 transition-all w-64"
                      style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                    />
                  </div>

                  {/* Department Filter */}
                  <div className="relative">
                    <button
                      onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                      className="flex items-center justify-between w-48 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                      style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                    >
                      <span>{departmentFilter}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${departmentDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {departmentDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                        {departments.map((dept) => (
                          <div
                            key={dept}
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                            onClick={() => {
                              setDepartmentFilter(dept);
                              setDepartmentDropdownOpen(false);
                            }}
                          >
                            {dept}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  Showing {filteredEmployees.length} of {employees.length} employees
                </div>
              </div>

              {/* Employee Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEmployees.map((employee) => (
                  <div key={employee.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg" style={{ backgroundColor: BRAND_COLORS.primary }}>
                            {employee.firstName[0]}{employee.lastName[0]}
                          </div>
                          <div className="ml-3">
                            <h3 className="font-semibold text-gray-900">{employee.firstName} {employee.lastName}</h3>
                            <p className="text-sm text-gray-600">{employee.position}</p>
                          </div>
                        </div>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(employee.status)}`}>
                          {employee.status}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <Building2 className="w-4 h-4 mr-2" />
                          {employee.department}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="w-4 h-4 mr-2" />
                          {employee.email}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="w-4 h-4 mr-2" />
                          {employee.phone}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          Started {formatDate(employee.startDate)}
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">Compensation</span>
                          <span className="font-medium text-gray-900">
                            {employee.payType === 'salary' 
                              ? formatCurrency(employee.salary || 0) + '/year'
                              : formatCurrency(employee.hourlyRate || 0) + '/hour'
                            }
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm text-gray-600">Employment Type</span>
                          <span className="text-sm font-medium text-gray-900 capitalize">{employee.employeeType}</span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => showNotification(`Viewing ${employee.firstName} ${employee.lastName}'s details`, 'info')}
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Eye className="w-4 h-4 inline mr-1" />
                            View
                          </button>
                          <button
                            onClick={() => showNotification(`Editing ${employee.firstName} ${employee.lastName}'s profile`, 'info')}
                            className="flex-1 px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 transition-colors"
                            style={{ backgroundColor: BRAND_COLORS.primary }}
                          >
                            <Edit3 className="w-4 h-4 inline mr-1" />
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Payroll Runs Tab */}
          {activeTab === 'payroll-runs' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-gray-900">Payroll Processing History</h3>
                  <button
                    onClick={() => showNotification('New payroll run created', 'success')}
                    className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors"
                    style={{ backgroundColor: BRAND_COLORS.primary }}
                  >
                    <Plus className="w-4 h-4" />
                    New Payroll Run
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pay Period</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pay Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employees</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gross Pay</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Pay</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {payrollRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(run.payPeriodStart)} - {formatDate(run.payPeriodEnd)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(run.payDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {run.totalEmployees}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(run.totalGrossPay)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(run.totalNetPay)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => showNotification(`Viewing payroll run details`, 'info')}
                            className="hover:text-gray-900 mr-3"
                            style={{ color: BRAND_COLORS.primary }}
                          >
                            View Details
                          </button>
                          {run.status === 'completed' && (
                            <button
                              onClick={() => showNotification(`Pay stubs downloaded`, 'success')}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Download
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tax Center Tab */}
          {activeTab === 'tax-center' && (
            <div className="space-y-8">
              {/* Tax Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.danger }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Total Tax Liability</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        {formatCurrency(taxLiabilities.reduce((sum, tax) => sum + tax.amount, 0))}
                      </div>
                      <div className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full inline-block">
                        3 payments due
                      </div>
                    </div>
                    <Receipt className="w-8 h-8" style={{ color: BRAND_COLORS.danger }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.warning }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">Next Payment Due</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">July 15</div>
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full inline-block">
                        Federal & State
                      </div>
                    </div>
                    <Calendar className="w-8 h-8" style={{ color: BRAND_COLORS.warning }} />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.success }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-600 text-sm font-medium mb-2">YTD Tax Paid</div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(18500)}</div>
                      <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full inline-block">
                        On schedule
                      </div>
                    </div>
                    <CheckCircle className="w-8 h-8" style={{ color: BRAND_COLORS.success }} />
                  </div>
                </div>
              </div>

              {/* Tax Liabilities Table */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900">Tax Liabilities & Deadlines</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {taxLiabilities.map((tax) => (
                        <tr key={tax.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                            {tax.taxType} Tax
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {tax.quarter} {tax.year}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(tax.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(tax.dueDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tax.status)}`}>
                              {tax.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => showNotification(`Processing ${tax.taxType} tax payment`, 'info')}
                              className="hover:text-gray-900 mr-3"
                              style={{ color: BRAND_COLORS.primary }}
                            >
                              Pay Now
                            </button>
                            <button
                              onClick={() => showNotification(`Downloading ${tax.taxType} tax form`, 'success')}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Download Form
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Add Employee Modal */}
          {newEmployeeModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 max-h-90vh overflow-y-auto shadow-2xl">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900">Add New Employee</h3>
                  <button
                    onClick={() => setNewEmployeeModalOpen(false)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                        <input
                          type="text"
                          value={newEmployeeForm.firstName}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, firstName: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                        <input
                          type="text"
                          value={newEmployeeForm.lastName}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, lastName: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                        <input
                          type="email"
                          value={newEmployeeForm.email}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, email: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                        <input
                          type="tel"
                          value={newEmployeeForm.phone}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, phone: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Employment Details */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Employment Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Position *</label>
                        <input
                          type="text"
                          value={newEmployeeForm.position}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, position: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
                        <select
                          value={newEmployeeForm.department}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, department: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        >
                          <option value="">Select Department</option>
                          {departments.slice(1).map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Employment Type</label>
                        <select
                          value={newEmployeeForm.employeeType}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, employeeType: e.target.value as 'full-time' | 'part-time' | 'contractor'}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        >
                          <option value="full-time">Full-Time</option>
                          <option value="part-time">Part-Time</option>
                          <option value="contractor">Contractor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                        <input
                          type="date"
                          value={newEmployeeForm.startDate}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, startDate: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Compensation */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Compensation</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Pay Type</label>
                        <select
                          value={newEmployeeForm.payType}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, payType: e.target.value as 'salary' | 'hourly'}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        >
                          <option value="salary">Salary</option>
                          <option value="hourly">Hourly</option>
                        </select>
                      </div>
                      {newEmployeeForm.payType === 'salary' ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Annual Salary ($)</label>
                          <input
                            type="number"
                            value={newEmployeeForm.salary}
                            onChange={(e) => setNewEmployeeForm(prev => ({...prev, salary: e.target.value}))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                            style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Hourly Rate ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newEmployeeForm.hourlyRate}
                            onChange={(e) => setNewEmployeeForm(prev => ({...prev, hourlyRate: e.target.value}))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                            style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                        <input
                          type="text"
                          value={newEmployeeForm.address}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, address: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tax ID (SSN)</label>
                        <input
                          type="text"
                          value={newEmployeeForm.taxId}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, taxId: e.target.value}))}
                          placeholder="XXX-XX-XXXX"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">PTO Days</label>
                        <input
                          type="number"
                          value={newEmployeeForm.paidTimeOff}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, paidTimeOff: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Emergency Contact</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                        <input
                          type="text"
                          value={newEmployeeForm.emergencyContactName}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, emergencyContactName: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                        <input
                          type="tel"
                          value={newEmployeeForm.emergencyContactPhone}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, emergencyContactPhone: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                        <input
                          type="text"
                          value={newEmployeeForm.emergencyContactRelationship}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, emergencyContactRelationship: e.target.value}))}
                          placeholder="e.g., Spouse, Parent"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition-all"
                          style={{ '--tw-ring-color': BRAND_COLORS.secondary + '33' } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Benefits */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Benefits Enrollment</h4>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="healthInsurance"
                          checked={newEmployeeForm.healthInsurance}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, healthInsurance: e.target.checked}))}
                          className="mr-3 h-4 w-4 border-gray-300 rounded"
                          style={{ accentColor: BRAND_COLORS.primary }}
                        />
                        <label htmlFor="healthInsurance" className="text-sm text-gray-700">Health Insurance</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="dentalInsurance"
                          checked={newEmployeeForm.dentalInsurance}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, dentalInsurance: e.target.checked}))}
                          className="mr-3 h-4 w-4 border-gray-300 rounded"
                          style={{ accentColor: BRAND_COLORS.primary }}
                        />
                        <label htmlFor="dentalInsurance" className="text-sm text-gray-700">Dental Insurance</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="retirement401k"
                          checked={newEmployeeForm.retirement401k}
                          onChange={(e) => setNewEmployeeForm(prev => ({...prev, retirement401k: e.target.checked}))}
                          className="mr-3 h-4 w-4 border-gray-300 rounded"
                          style={{ accentColor: BRAND_COLORS.primary }}
                        />
                        <label htmlFor="retirement401k" className="text-sm text-gray-700">401(k) Retirement Plan</label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={handleNewEmployee}
                      className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors"
                      style={{ backgroundColor: BRAND_COLORS.primary }}
                    >
                      Add Employee
                    </button>
                    <button
                      onClick={() => setNewEmployeeModalOpen(false)}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notification */}
          {notification.show && (
            <div className={`fixed top-5 right-5 z-50 px-6 py-4 rounded-lg text-white font-medium shadow-lg transition-transform ${
              notification.type === 'success' ? 'bg-green-500' :
              notification.type === 'error' ? 'bg-red-500' :
              notification.type === 'warning' ? 'bg-yellow-500' :
              'bg-blue-500'
            } ${notification.show ? 'translate-x-0' : 'translate-x-full'}`}>
              {notification.message}
            </div>
          )}

          {/* Click outside to close dropdowns */}
          {departmentDropdownOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => setDepartmentDropdownOpen(false)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
