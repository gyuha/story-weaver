import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HdIcon } from '@/features/helpdesk/components/ui/hd-icon'
import { useLogin } from '@/features/helpdesk/hooks/use-auth'

function Aside() {
  return (
    <div className="auth__aside">
      <div className="auth__brand">
        <span className="auth__wordmark">Bootstrap</span>
        <span className="nav__brand-tag" style={{ color: '#fff', background: 'rgba(255,255,255,.14)' }}>헬프센터</span>
      </div>
      <div className="auth__aside-body">
        <h2>궁금한 점이 있으신가요?<br/>여기서 해결하세요.</h2>
        <p>결제·이용·버그 문의부터 기능 제안까지. 운영팀이 영업일 기준 24시간 이내에 답변드립니다.</p>
        <div className="auth__features">
          {([['chat','1:1 문의 — 빠른 답변'],['help','FAQ — 자주 묻는 질문 모음'],['bulb','기능 제안 — 직접 의견 남기기']] as [string,string][]).map(([ic,txt]) => (
            <div className="auth__feature" key={ic}>
              <span className="auth__feature-ic"><HdIcon name={ic} size={18}/></span>{txt}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HdLoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{email?:string;pw?:string}>({})
  const login = useLogin()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!email.trim()) errs.email = '이메일을 입력해 주세요.'
    if (!pw) errs.pw = '비밀번호를 입력해 주세요.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    login.mutate({ email: email.trim(), password: pw }, {
      onSuccess: () => onSuccess?.(),
      onError: (err: unknown) => setErrors({ pw: (err as Error).message || '로그인에 실패했습니다.' }),
    })
  }

  return (
    <div className="auth">
      <Aside />
      <div className="auth__main">
        <div className="auth__card">
          <h1>로그인</h1>
          <p className="auth__card-sub">헬프센터 계정으로 로그인하세요.</p>
          <form className="auth__form" onSubmit={submit} noValidate>
            <div className="w-field">
              <label className="w-field__label">이메일 Email</label>
              <input className="w-input" type="email" placeholder="이메일 주소를 입력하세요"
                value={email} onChange={e=>setEmail(e.target.value)}
                aria-invalid={!!errors.email} autoComplete="email" />
              {errors.email && <div className="w-field__error">{errors.email}</div>}
            </div>
            <div className="w-field">
              <label className="w-field__label">비밀번호 Password</label>
              <div className="auth__pw-wrap">
                <input className="w-input" type={show?'text':'password'} placeholder="••••••••"
                  value={pw} onChange={e=>setPw(e.target.value)}
                  aria-invalid={!!errors.pw} autoComplete="current-password" />
                <button type="button" className="w-iconbtn auth__pw-toggle" onClick={()=>setShow(s=>!s)}>
                  <HdIcon name={show?'eye':'lock'} size={18}/>
                </button>
              </div>
              {errors.pw && <div className="w-field__error">{errors.pw}</div>}
            </div>
            <button type="submit" className="w-btn w-btn--solid w-btn--lg w-btn--block" disabled={login.isPending}>
              {login.isPending ? '로그인 중…' : '로그인'}
            </button>
          </form>
          <p className="auth__switch">
            아직 계정이 없으신가요? <Link to="/auth/signup">회원가입</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
