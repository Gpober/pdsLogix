'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FileText, TrendingUp, Clock, CreditCard, Users, CheckSquare } from 'lucide-react'
import { getAuthClient } from '@/lib/supabase/client'

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

interface NavCard {
  title: string
  description: string
  icon: React.ReactNode
  path: string
  color: string
  bgGradient: string
}

export default function MobileDashboardLanding() {
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const authClient = getAuthClient()

  // Check user role on mount
  useEffect(() => {
    const checkRole = async () => {
      const { data: { session } } = await authClient.auth.getSession()
      if (session?.user) {
        const { data: userData } = await authClient
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          setUserRole(userData.role)
        }
      }
    }
    checkRole()
  }, [])

  const navCards: NavCard[] = [
    {
      title: 'P&L Statement',
      description: 'Profit & Loss by customer',
      icon: <FileText size={28} />,
      path: '/mobile-dashboard/pl',
      color: BRAND_COLORS.primary,
      bgGradient: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
    },
    {
      title: 'Cash Flow',
      description: 'Inflows & outflows',
      icon: <TrendingUp size={28} />,
      path: '/mobile-dashboard/cash-flow',
      color: BRAND_COLORS.success,
      bgGradient: `linear-gradient(135deg, ${BRAND_COLORS.success} 0%, #2ECC71 100%)`
    },
    {
      title: 'A/R Aging',
      description: 'Outstanding receivables',
      icon: <Clock size={28} />,
      path: '/mobile-dashboard/ar',
      color: BRAND_COLORS.warning,
      bgGradient: `linear-gradient(135deg, ${BRAND_COLORS.warning} 0%, #F8B500 100%)`
    },
    {
      title: 'A/P Aging',
      description: 'Outstanding payables',
      icon: <CreditCard size={28} />,
      path: '/mobile-dashboard/ap',
      color: BRAND_COLORS.danger,
      bgGradient: `linear-gradient(135deg, ${BRAND_COLORS.danger} 0%, #EC7063 100%)`
    },
    {
      title: 'Payroll',
      description: 'Submit & approve hours',
      icon: <Users size={28} />,
      path: '/mobile-dashboard/payroll',
      color: BRAND_COLORS.accent,
      bgGradient: `linear-gradient(135deg, ${BRAND_COLORS.accent} 0%, ${BRAND_COLORS.tertiary} 100%)`
    }
  ]

  // Add "Submit All Payroll" card for super_admin
  if (userRole === 'super_admin') {
    navCards.push({
      title: 'Submit Payroll',
      description: 'Submit payroll for all locations',
      icon: <CheckSquare size={28} />,
      path: '/mobile-dashboard/payroll/submit/submit-all',
      color: '#9B59B6', // Purple for admin feature
      bgGradient: 'linear-gradient(135deg, #9B59B6 0%, #8E44AD 100%)'
    })
  }

  const handleCardClick = (path: string) => {
    router.push(path)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'white',
      padding: '20px',
      paddingTop: '40px'
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '24px'
      }}>
        <img 
          src="/iamcfo-logo.jpg" 
          alt="I AM CFO Logo"
          style={{
            height: '80px',
            width: 'auto',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* Header */}
      <div style={{
        marginBottom: '32px',
        textAlign: 'center'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '32px',
          fontWeight: 'bold',
          color: BRAND_COLORS.primary,
          marginBottom: '8px'
        }}>
          I AM CFO
        </h1>
        <p style={{
          margin: 0,
          fontSize: '16px',
          color: BRAND_COLORS.gray[600]
        }}>
          Your Financial Command Center
        </p>
      </div>

      {/* Navigation Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        {navCards.map((card, index) => (
          <button
            key={index}
            onClick={() => handleCardClick(card.path)}
            style={{
              background: 'white',
              border: `2px solid ${BRAND_COLORS.gray[200]}`,
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px)'
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)'
            }}
          >
            {/* Gradient accent bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '6px',
              background: card.bgGradient
            }} />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              {/* Icon */}
              <div style={{
                background: card.bgGradient,
                borderRadius: '16px',
                width: '64px',
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                flexShrink: 0,
                boxShadow: `0 4px 12px ${card.color}40`
              }}>
                {card.icon}
              </div>

              {/* Text Content */}
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: BRAND_COLORS.gray[900],
                  marginBottom: '4px'
                }}>
                  {card.title}
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: BRAND_COLORS.gray[600],
                  fontWeight: '500'
                }}>
                  {card.description}
                </p>
              </div>

              {/* Arrow Indicator */}
              <div style={{
                color: card.color,
                fontSize: '24px',
                fontWeight: 'bold',
                flexShrink: 0
              }}>
                →
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer Note */}
      <div style={{
        marginTop: '40px',
        textAlign: 'center',
        color: BRAND_COLORS.gray[500],
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>
          Select a report to view detailed insights
        </p>
      </div>
    </div>
  )
}
