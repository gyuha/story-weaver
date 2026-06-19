import { z } from 'zod';

export const profileSchema = z.object({
  displayName: z.string().min(1, '표시 이름을 입력하세요').max(30, '30자 이하로 입력하세요'),
  avatarEmoji: z.string().min(1, '이모지를 입력하세요').max(4, '이모지 하나만 입력하세요'),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

export const passwordSchema = z
  .object({
    current: z.string().min(1, '현재 비밀번호를 입력하세요'),
    next: z.string().min(8, '새 비밀번호는 8자 이상이어야 합니다'),
    confirm: z.string().min(1, '새 비밀번호를 다시 입력하세요'),
  })
  .refine((v) => v.next === v.confirm, {
    path: ['confirm'],
    message: '새 비밀번호가 일치하지 않습니다',
  });
export type PasswordFormValues = z.infer<typeof passwordSchema>;
