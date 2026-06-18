import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">StoryWeaver</h1>
      <p className="max-w-md text-muted-foreground">
        AI 웹소설 창작 플랫폼. 작업 공간(World Bible · 메모리 · Smart Editor)은 MVP 마일스톤에서 구현됩니다.
      </p>
      <div className="flex gap-4">
        <Link to="/auth/login" className="underline">로그인</Link>
        <Link to="/auth/signup" className="underline">회원가입</Link>
      </div>
    </div>
  )
}
