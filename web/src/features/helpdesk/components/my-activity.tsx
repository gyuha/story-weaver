import { HdAvatar, HdIcon } from './ui'
import { useAuthStore } from '@/features/auth/store/auth.store'

interface Props {
  onBack: () => void
}

export function MyActivity({ onBack }: Props) {
  const user = useAuthStore((s) => s.user)
  const displayName = user?.email?.split('@')[0] ?? '알 수 없음'

  return (
    <div className="my-activity">
      <button className="btn-back" onClick={onBack}>
        <HdIcon name="arrowLeft" />
        뒤로
      </button>

      <div className="me-profile">
        <HdAvatar name={displayName} size="xl" />
        <p className="me-profile__name">{displayName}</p>
        <p className="me-profile__email">{user?.email}</p>
        <span className="me-profile__role">{user?.role ?? 'USER'}</span>
        <div className="me-profile__stats">
          <span className="me-stat">작성 글 0</span>
          <span className="me-stat">작성 댓글 0</span>
          <span className="me-stat">받은 추천 0</span>
        </div>
      </div>

      <div className="panel">
        활동 내역 API 엔드포인트가 아직 제공되지 않습니다. 백엔드 구현 후 자동으로 연동됩니다.
      </div>
    </div>
  )
}
