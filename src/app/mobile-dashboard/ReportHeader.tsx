'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Menu, Calendar, X } from 'lucide-react'

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1',
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
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
}

interface ReportHeaderProps {
  title: string
  subtitle: string
  showDateFilter?: boolean
  startDate?: string
  endDate?: string
  onDateChange?: (startDate: string, endDate: string) => void
}

export default function ReportHeader({
  title,
  subtitle,
  showDateFilter = true,
  startDate = '',
  endDate = '',
  onDateChange
}: ReportHeaderProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [tempStartDate, setTempStartDate] = useState(startDate)
  const [tempEndDate, setTempEndDate] = useState(endDate)

  const handleBack = () => {
    router.push('/mobile-dashboard')
  }

  const handleApplyDates = () => {
    if (onDateChange && tempStartDate && tempEndDate) {
      onDateChange(tempStartDate, tempEndDate)
    }
    setIsMenuOpen(false)
  }

  const handleClearDates = () => {
    setTempStartDate('')
    setTempEndDate('')
    if (onDateChange) {
      onDateChange('', '')
    }
    setIsMenuOpen(false)
  }

  return (
    <>
      <div style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(10px)',
        borderBottom: `3px solid ${BRAND_COLORS.primary}`,
        padding: '20px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 2px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          {/* Back Button */}
          <button
            onClick={handleBack}
            style={{
              background: BRAND_COLORS.primary,
              border: 'none',
              borderRadius: '12px',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
          >
            <ChevronLeft size={24} color="white" />
          </button>

          {/* Title */}
          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 'bold',
              color: BRAND_COLORS.gray[900]
            }}>
              {title}
            </h1>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: BRAND_COLORS.gray[600]
            }}>
              {subtitle}
            </p>
          </div>

          {/* Hamburger Menu Button */}
          {showDateFilter && (
            <button
              onClick={() => setIsMenuOpen(true)}
              style={{
                background: BRAND_COLORS.gray[100],
                border: 'none',
                borderRadius: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <Menu size={24} color={BRAND_COLORS.gray[700]} />
            </button>
          )}
        </div>
      </div>

      {/* Hamburger Menu Modal */}
      {isMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end'
        }}
        onClick={() => setIsMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              width: '320px',
              maxWidth: '90%',
              height: '100vh',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
              animation: 'slideInRight 0.3s ease-out',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <style jsx>{`
              @keyframes slideInRight {
                from {
                  transform: translateX(100%);
                }
                to {
                  transform: translateX(0);
                }
              }
            `}</style>

            {/* Menu Header */}
            <div style={{
              padding: '20px',
              borderBottom: `2px solid ${BRAND_COLORS.gray[200]}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold',
                color: BRAND_COLORS.gray[900]
              }}>
                Filter Options
              </h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={24} color={BRAND_COLORS.gray[600]} />
              </button>
            </div>

            {/* Menu Content */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto'
            }}>
              {/* Date Range Section */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <Calendar size={20} color={BRAND_COLORS.primary} />
                  <h3 style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '600',
                    color: BRAND_COLORS.gray[800]
                  }}>
                    Date Range
                  </h3>
                </div>

                {/* Start Date */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: BRAND_COLORS.gray[700],
                    marginBottom: '8px'
                  }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={tempStartDate}
                    onChange={(e) => setTempStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${BRAND_COLORS.gray[200]}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* End Date */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: BRAND_COLORS.gray[700],
                    marginBottom: '8px'
                  }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={tempEndDate}
                    onChange={(e) => setTempEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${BRAND_COLORS.gray[200]}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Quick Date Presets */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginTop: '12px'
                }}>
                  <button
                    onClick={() => {
                      const today = new Date()
                      const thirtyDaysAgo = new Date(today)
                      thirtyDaysAgo.setDate(today.getDate() - 30)
                      setTempStartDate(thirtyDaysAgo.toISOString().split('T')[0])
                      setTempEndDate(today.toISOString().split('T')[0])
                    }}
                    style={{
                      padding: '8px',
                      background: BRAND_COLORS.gray[100],
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      cursor: 'pointer'
                    }}
                  >
                    Last 30 Days
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date()
                      const ninetyDaysAgo = new Date(today)
                      ninetyDaysAgo.setDate(today.getDate() - 90)
                      setTempStartDate(ninetyDaysAgo.toISOString().split('T')[0])
                      setTempEndDate(today.toISOString().split('T')[0])
                    }}
                    style={{
                      padding: '8px',
                      background: BRAND_COLORS.gray[100],
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      cursor: 'pointer'
                    }}
                  >
                    Last 90 Days
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date()
                      const firstDayOfYear = new Date(today.getFullYear(), 0, 1)
                      setTempStartDate(firstDayOfYear.toISOString().split('T')[0])
                      setTempEndDate(today.toISOString().split('T')[0])
                    }}
                    style={{
                      padding: '8px',
                      background: BRAND_COLORS.gray[100],
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      cursor: 'pointer'
                    }}
                  >
                    Year to Date
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date()
                      const lastYear = new Date(today)
                      lastYear.setFullYear(today.getFullYear() - 1)
                      setTempStartDate(lastYear.toISOString().split('T')[0])
                      setTempEndDate(today.toISOString().split('T')[0])
                    }}
                    style={{
                      padding: '8px',
                      background: BRAND_COLORS.gray[100],
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      cursor: 'pointer'
                    }}
                  >
                    Last Year
                  </button>
                </div>
              </div>
            </div>

            {/* Menu Footer Actions */}
            <div style={{
              padding: '20px',
              borderTop: `2px solid ${BRAND_COLORS.gray[200]}`,
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={handleClearDates}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'white',
                  border: `2px solid ${BRAND_COLORS.gray[300]}`,
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: BRAND_COLORS.gray[700],
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
              <button
                onClick={handleApplyDates}
                disabled={!tempStartDate || !tempEndDate}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: tempStartDate && tempEndDate
                    ? `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
                    : BRAND_COLORS.gray[300],
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'white',
                  cursor: tempStartDate && tempEndDate ? 'pointer' : 'not-allowed',
                  boxShadow: tempStartDate && tempEndDate ? '0 4px 12px rgba(86, 182, 233, 0.3)' : 'none'
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
