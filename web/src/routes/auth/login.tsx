import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HdLoginPage } from '@/features/auth/components/hd-login-page'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  return <HdLoginPage onSuccess={() => navigate({ to: '/' })} />
}
