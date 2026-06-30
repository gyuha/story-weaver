import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/features/auth/api/auth.api';
import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { type Theme, useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  type PasswordFormValues,
  type ProfileFormValues,
  passwordSchema,
  profileSchema,
} from '../schema/settings.schema';
import { useSettingsStore } from '../store/settings.store';
import type { AuthProvider } from '../types/settings';
import { SettingsSection } from './settings-section';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
];

const PROVIDER_LABEL: Record<Exclude<AuthProvider, 'email'>, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[12px] text-danger">{message}</p>;
}

export function AccountScreen() {
  return (
    <div className="max-w-[660px] px-12 pt-[34px] pb-16">
      <h1 className="mb-7 font-serif text-[27px] font-bold leading-[1.1] text-ink">개인 설정</h1>
      <ProfileSection />
      <ThemeSection />
      <PasswordSection />
      <DangerZone />
    </div>
  );
}

function ProfileSection() {
  const profile = useSettingsStore((s) => s.profile);
  const updateProfile = useSettingsStore((s) => s.updateProfile);
  const email = useAuthStore((s) => s.user?.email ?? '');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: profile.displayName, avatarEmoji: profile.avatarEmoji },
  });

  const onSubmit = handleSubmit((values) => {
    updateProfile(values);
    toast.success('프로필을 저장했습니다');
  });

  return (
    <SettingsSection title="프로필" description="작품 화면과 댓글에 표시되는 정보입니다.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex items-end gap-4">
          <div className="grid size-[58px] shrink-0 place-items-center rounded-xl bg-[#f1f1ef] text-[30px]">
            {profile.avatarEmoji}
          </div>
          <div className="flex-1">
            <Label htmlFor="avatarEmoji">아바타 이모지</Label>
            <Input id="avatarEmoji" className="mt-1.5 w-28" {...register('avatarEmoji')} />
            <FieldError message={errors.avatarEmoji?.message} />
          </div>
        </div>
        <div>
          <Label htmlFor="displayName">표시 이름</Label>
          <Input id="displayName" className="mt-1.5" {...register('displayName')} />
          <FieldError message={errors.displayName?.message} />
        </div>
        <div>
          <Label htmlFor="email">이메일</Label>
          <Input id="email" className="mt-1.5" value={email} disabled />
          <p className="mt-1 text-[12px] text-faint">이메일은 변경할 수 없습니다.</p>
        </div>
        <div>
          <Button type="submit">저장</Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection title="테마" description="선택 즉시 적용됩니다.">
      <div className="inline-flex gap-1 rounded-lg border border-line bg-surface p-1">
        {THEMES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              'rounded-[5px] px-4 py-1.5 text-sm transition-colors',
              theme === value
                ? 'bg-paper font-medium text-ink shadow-sm'
                : 'text-muted-ink hover:text-ink'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}

export function PasswordSection() {
  const provider = useSettingsStore((s) => s.profile.provider);
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clear);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    setSubmitting(true);
    try {
      await authApi.changePassword({
        body: { current_password: values.current, new_password: values.next },
      });
      // 변경 시 전체 세션이 무효화되므로 로컬 세션도 비우고 재로그인을 유도한다.
      clearSession();
      toast.success('비밀번호가 변경되어 다시 로그인해 주세요');
      navigate({ to: '/auth/login' });
    } catch (err) {
      setFormError(
        apiErrorMessage(err, '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.')
      );
    } finally {
      setSubmitting(false);
    }
  });

  if (provider !== 'email') {
    return (
      <SettingsSection title="비밀번호">
        <p className="text-[13px] leading-[1.6] text-muted-ink">
          {PROVIDER_LABEL[provider]} 소셜 로그인 계정입니다. 비밀번호 변경은 해당 서비스에서
          진행하세요.
        </p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="비밀번호 변경">
      <form onSubmit={onSubmit} className="flex max-w-[360px] flex-col gap-4">
        <div>
          <Label htmlFor="current">현재 비밀번호</Label>
          <Input id="current" type="password" className="mt-1.5" {...register('current')} />
          <FieldError message={errors.current?.message} />
        </div>
        <div>
          <Label htmlFor="next">새 비밀번호</Label>
          <Input id="next" type="password" className="mt-1.5" {...register('next')} />
          <FieldError message={errors.next?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">새 비밀번호 확인</Label>
          <Input id="confirm" type="password" className="mt-1.5" {...register('confirm')} />
          <FieldError message={errors.confirm?.message} />
        </div>
        {formError && <p className="text-[13px] text-danger">{formError}</p>}
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? '변경 중…' : '비밀번호 변경'}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);

  const onConfirm = () => {
    clear();
    navigate({ to: '/auth/login' });
  };

  return (
    <SettingsSection title="계정 탈퇴" description="탈퇴하면 모든 작품과 설정이 삭제됩니다.">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" />}>계정 탈퇴</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 탈퇴하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 모든 작품·World Bible·원고가 영구 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>탈퇴</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
