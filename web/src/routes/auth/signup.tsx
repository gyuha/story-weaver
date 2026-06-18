import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HdSignupPage } from '@/features/auth/components/hd-signup-page'

export const Route = createFileRoute('/auth/signup')({
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  return <HdSignupPage onSuccess={() => navigate({ to: '/auth/login' })} />
}
