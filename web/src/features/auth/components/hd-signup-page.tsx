import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HdIcon } from '@/features/helpdesk/components/ui/hd-icon'
import { useSignup } from '@/features/helpdesk/hooks/use-auth'

export function HdSignupPage({ onSuccess }: { onSuccess?: () => void }) {
  const [f, setF] = useState({ email: '', pw: '', pw2: '' })
  const [show, setShow] = useState(false)
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const signup = useSignup()

  const strength = (() => {
    let s = 0
    if (f.pw.length >= 8) s++
    if (/[A-Z]/.test(f.pw) || /[^a-zA-Z0-9]/.test(f.pw)) s++
    if (/[0-9]/.test(f.pw)) s++
    if (f.pw.length >= 12) s++
    return Math.min(s, 4)
  })()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(f.email)) errs.email = '올바른 이메일 형식이 아닙니다.'
    if (f.pw.length < 8) errs.pw = '비밀번호는 8자 이상이어야 합니다.'
    if (f.pw !== f.pw2) errs.pw2 = '비밀번호가 일치하지 않습니다.'
    if (!agree) errs.agree = '약관에 동의해 주세요.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    signup.mutate({ email: f.email.trim(), password: f.pw }, {
      onSuccess: () => onSuccess?.(),
      onError: (err: unknown) => setErrors({ email: (err as Error).message || '회원가입에 실패했습니다.' }),
    })
  }

  return (
    <div className="auth auth--split">
      <div className="auth__aside">
        <div className="auth__aside-brand">
          <span className="auth__aside-brand-name">Bootstrap</span>
          <span className="auth__aside-brand-tag">헬프센터</span>
        </div>
        <h2 className="auth__aside-heading">궁금한 점이 있으신가요?{'\n'}여기서 해결하세요.</h2>
        <p className="auth__aside-desc">결제·이용·버그 문의부터 기능 제안까지.</p>
      </div>

      <div className="auth__main">
        <div className="auth__card">
          <h1 className="auth__title">회원가입</h1>
          <p className="auth__card-sub">30초면 충분해요. 이메일로 바로 시작하세요.</p>

          <form className="auth__form" onSubmit={submit} noValidate>
            <div className="w-field">
              <label className="w-field__label">이메일 Email</label>
              <input
                className="w-input"
                type="email"
                placeholder="이메일 주소를 입력하세요"
                value={f.email}
                onChange={e => setF(s => ({ ...s, email: e.target.value }))}
                aria-invalid={!!errors.email}
              />
              {errors.email && <div className="w-field__error">{errors.email}</div>}
            </div>

            <div className="w-field">
              <label className="w-field__label">비밀번호 Password</label>
              <div className="auth__pw-wrap">
                <input
                  className="w-input"
                  type={show ? 'text' : 'password'}
                  placeholder="8자 이상"
                  value={f.pw}
                  onChange={e => setF(s => ({ ...s, pw: e.target.value }))}
                  aria-invalid={!!errors.pw}
                />
                <button type="button" className="w-iconbtn auth__pw-toggle" onClick={() => setShow(s => !s)}>
                  <HdIcon name={show ? 'eye' : 'lock'} size={18} />
                </button>
              </div>
              {f.pw && (
                <div className="pw-meter" data-strength={strength}>
                  <span className="pw-meter__bar" />
                  <span className="pw-meter__bar" />
                  <span className="pw-meter__bar" />
                  <span className="pw-meter__bar" />
                </div>
              )}
              {errors.pw && <div className="w-field__error">{errors.pw}</div>}
            </div>

            <div className="w-field">
              <label className="w-field__label">비밀번호 확인</label>
              <input
                className="w-input"
                type={show ? 'text' : 'password'}
                placeholder="한 번 더 입력"
                value={f.pw2}
                onChange={e => setF(s => ({ ...s, pw2: e.target.value }))}
                aria-invalid={!!errors.pw2}
              />
              {errors.pw2 && <div className="w-field__error">{errors.pw2}</div>}
            </div>

            <div>
              <label className="auth__check" style={errors.agree ? { color: 'var(--w-status-negative)' } : undefined}>
                <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                이용약관 및 개인정보처리방침에 동의합니다.
              </label>
              {errors.agree && <div className="w-field__error">{errors.agree}</div>}
            </div>

            <button
              type="submit"
              className="w-btn w-btn--solid w-btn--lg w-btn--block"
              disabled={signup.isPending}
            >
              {signup.isPending ? '가입 중…' : '가입하고 시작하기'}
            </button>
          </form>

          <p className="auth__switch">
            이미 계정이 있으신가요? <Link to="/auth/login">로그인</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
