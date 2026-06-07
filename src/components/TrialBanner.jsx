import { useAuth } from '../context/AuthContext'

export default function TrialBanner() {
  const { trialInfo } = useAuth()

  if (!trialInfo) return null
  if (trialInfo.activated) return null
  if (!trialInfo.allowed) return null
  if (trialInfo.remaining > 3) return null

  return (
    <div style={{
      background: trialInfo.remaining <= 1 ? '#fee2e2' : '#fef3c7',
      color: trialInfo.remaining <= 1 ? '#991b1b' : '#92400e',
      padding: '6px 16px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: '500',
      borderBottom: '1px solid',
      borderColor: trialInfo.remaining <= 1 ? '#fca5a5' : '#fcd34d'
    }}>
      ⏳ Trial expires in <strong>{trialInfo.remaining} day{trialInfo.remaining !== 1 ? 's' : ''}</strong>.
      Click "Activate system" on the login screen to continue after trial.
    </div>
  )
}