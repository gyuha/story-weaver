import {
  AppWindow,
  BarChart3,
  CheckSquare,
  Construction,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  LogIn,
  type LucideIcon,
  MessagesSquare,
  SearchX,
  ServerCrash,
  Settings,
  ShieldAlert,
  Smartphone,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react';

export const SAMPLE_ROOT_PATH = '/sample';
export const SAMPLE_DASHBOARD_PATH = '/sample/dashboard';
export const SAMPLE_AUTH_ROOT_PATH = '/sample/auth';
export const SAMPLE_ERRORS_ROOT_PATH = '/sample/errors';
export const SAMPLE_SIGN_IN_PATH = '/sample/auth/sign-in';
export const SAMPLE_SIGN_IN_2_PATH = '/sample/auth/sign-in-2';
export const SAMPLE_SIGN_UP_PATH = '/sample/auth/sign-up';
export const SAMPLE_FORGOT_PASSWORD_PATH = '/sample/auth/forgot-password';
export const SAMPLE_OTP_PATH = '/sample/auth/otp';
export const SAMPLE_LOGIN_PATH = '/sample/auth/login';
export const SAMPLE_SIGNUP_PATH = '/sample/auth/signup';
export const SAMPLE_SIGN_IN_2_COLUMN_PATH = '/sample/auth/sign-in-2-column';
export const SAMPLE_ERROR_UNAUTHORIZED_PATH = '/sample/errors/unauthorized';
export const SAMPLE_ERROR_FORBIDDEN_PATH = '/sample/errors/forbidden';
export const SAMPLE_ERROR_NOT_FOUND_PATH = '/sample/errors/not-found';
export const SAMPLE_ERROR_INTERNAL_SERVER_ERROR_PATH = '/sample/errors/internal-server-error';
export const SAMPLE_ERROR_MAINTENANCE_PATH = '/sample/errors/maintenance-error';
export const SAMPLE_ERROR_MAINTENANCE_ALIAS_PATH = '/sample/errors/maintenance';
export const SAMPLE_ERROR_401_PATH = '/sample/errors/401';
export const SAMPLE_ERROR_403_PATH = '/sample/errors/403';
export const SAMPLE_ERROR_404_PATH = '/sample/errors/404';
export const SAMPLE_ERROR_500_PATH = '/sample/errors/500';
export const SAMPLE_ERROR_503_PATH = '/sample/errors/503';

export type SampleRouteTo =
  | typeof SAMPLE_DASHBOARD_PATH
  | '/sample/users'
  | '/sample/tasks'
  | '/sample/apps'
  | '/sample/chats'
  | '/sample/settings'
  | '/sample/help-center'
  | typeof SAMPLE_SIGN_IN_PATH
  | typeof SAMPLE_SIGN_IN_2_PATH
  | typeof SAMPLE_SIGN_UP_PATH
  | typeof SAMPLE_FORGOT_PASSWORD_PATH
  | typeof SAMPLE_OTP_PATH
  | typeof SAMPLE_ERROR_UNAUTHORIZED_PATH
  | typeof SAMPLE_ERROR_FORBIDDEN_PATH
  | typeof SAMPLE_ERROR_NOT_FOUND_PATH
  | typeof SAMPLE_ERROR_INTERNAL_SERVER_ERROR_PATH
  | typeof SAMPLE_ERROR_MAINTENANCE_PATH;

type SampleRouteAlias =
  | typeof SAMPLE_LOGIN_PATH
  | typeof SAMPLE_SIGNUP_PATH
  | typeof SAMPLE_SIGN_IN_2_COLUMN_PATH
  | typeof SAMPLE_ERROR_MAINTENANCE_ALIAS_PATH
  | typeof SAMPLE_ERROR_401_PATH
  | typeof SAMPLE_ERROR_403_PATH
  | typeof SAMPLE_ERROR_404_PATH
  | typeof SAMPLE_ERROR_500_PATH
  | typeof SAMPLE_ERROR_503_PATH;

type SampleNavLinkI18nKey =
  | 'dashboard'
  | 'users'
  | 'tasks'
  | 'apps'
  | 'chats'
  | 'settings'
  | 'helpCenter'
  | 'signIn'
  | 'signIn2Column'
  | 'signUp'
  | 'forgotPassword'
  | 'otp'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'internalServerError'
  | 'maintenance';

export type SampleAccordionNavValue = 'auth' | 'errors';
type SampleAccordionNavI18nKey = SampleAccordionNavValue;
type SampleNavI18nKey = SampleNavLinkI18nKey | SampleAccordionNavI18nKey;

interface SampleNavLabelI18nKeys<TI18nKey extends SampleNavI18nKey> {
  i18nKey: TI18nKey;
  titleI18nKey: `nav.${TI18nKey}.title`;
  descriptionI18nKey: `nav.${TI18nKey}.description`;
}

export interface SampleNavItem extends SampleNavLabelI18nKeys<SampleNavLinkI18nKey> {
  kind: 'link';
  to: SampleRouteTo;
  icon: LucideIcon;
  aliases?: readonly SampleRouteAlias[];
}

export interface SampleAccordionNavGroup extends SampleNavLabelI18nKeys<SampleAccordionNavI18nKey> {
  kind: 'accordion';
  value: SampleAccordionNavValue;
  icon: LucideIcon;
  items: readonly SampleNavItem[];
}

function getSampleNavLabelI18nKeys<TI18nKey extends SampleNavI18nKey>(
  i18nKey: TI18nKey
): SampleNavLabelI18nKeys<TI18nKey> {
  return {
    i18nKey,
    titleI18nKey: `nav.${i18nKey}.title` as `nav.${TI18nKey}.title`,
    descriptionI18nKey: `nav.${i18nKey}.description` as `nav.${TI18nKey}.description`,
  };
}

export const sampleNavItems: readonly SampleNavItem[] = [
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('dashboard'),
    to: SAMPLE_DASHBOARD_PATH,
    icon: BarChart3,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('users'),
    to: '/sample/users',
    icon: Users,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('tasks'),
    to: '/sample/tasks',
    icon: CheckSquare,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('apps'),
    to: '/sample/apps',
    icon: AppWindow,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('chats'),
    to: '/sample/chats',
    icon: MessagesSquare,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('settings'),
    to: '/sample/settings',
    icon: Settings,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('helpCenter'),
    to: '/sample/help-center',
    icon: LifeBuoy,
  },
] as const;

export const sampleAuthNavItems: readonly SampleNavItem[] = [
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('signIn'),
    to: SAMPLE_SIGN_IN_PATH,
    icon: LogIn,
    aliases: [SAMPLE_LOGIN_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('signIn2Column'),
    to: SAMPLE_SIGN_IN_2_PATH,
    icon: LogIn,
    aliases: [SAMPLE_SIGN_IN_2_COLUMN_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('signUp'),
    to: SAMPLE_SIGN_UP_PATH,
    icon: UserPlus,
    aliases: [SAMPLE_SIGNUP_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('forgotPassword'),
    to: SAMPLE_FORGOT_PASSWORD_PATH,
    icon: KeyRound,
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('otp'),
    to: SAMPLE_OTP_PATH,
    icon: Smartphone,
  },
] as const;

export const sampleAuthMenuItem = {
  kind: 'accordion',
  value: 'auth',
  ...getSampleNavLabelI18nKeys('auth'),
  icon: LockKeyhole,
  items: sampleAuthNavItems,
} as const satisfies SampleAccordionNavGroup;

export const sampleErrorNavItems: readonly SampleNavItem[] = [
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('unauthorized'),
    to: SAMPLE_ERROR_UNAUTHORIZED_PATH,
    icon: ShieldAlert,
    aliases: [SAMPLE_ERROR_401_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('forbidden'),
    to: SAMPLE_ERROR_FORBIDDEN_PATH,
    icon: LockKeyhole,
    aliases: [SAMPLE_ERROR_403_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('notFound'),
    to: SAMPLE_ERROR_NOT_FOUND_PATH,
    icon: SearchX,
    aliases: [SAMPLE_ERROR_404_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('internalServerError'),
    to: SAMPLE_ERROR_INTERNAL_SERVER_ERROR_PATH,
    icon: ServerCrash,
    aliases: [SAMPLE_ERROR_500_PATH],
  },
  {
    kind: 'link',
    ...getSampleNavLabelI18nKeys('maintenance'),
    to: SAMPLE_ERROR_MAINTENANCE_PATH,
    icon: Construction,
    aliases: [SAMPLE_ERROR_503_PATH, SAMPLE_ERROR_MAINTENANCE_ALIAS_PATH],
  },
] as const;

export const sampleErrorsMenuItem = {
  kind: 'accordion',
  value: 'errors',
  ...getSampleNavLabelI18nKeys('errors'),
  icon: TriangleAlert,
  items: sampleErrorNavItems,
} as const satisfies SampleAccordionNavGroup;

export const sampleAccordionNavGroups = [
  sampleAuthMenuItem,
  sampleErrorsMenuItem,
] as const satisfies readonly SampleAccordionNavGroup[];

const sampleAccordionNavValues = [
  sampleAuthMenuItem.value,
  sampleErrorsMenuItem.value,
] as const satisfies readonly SampleAccordionNavValue[];

export function isSamplePath(pathname: string): boolean {
  return pathname === SAMPLE_ROOT_PATH || pathname.startsWith(`${SAMPLE_ROOT_PATH}/`);
}

export function isSampleAuthPath(pathname: string): boolean {
  return pathname === SAMPLE_AUTH_ROOT_PATH || pathname.startsWith(`${SAMPLE_AUTH_ROOT_PATH}/`);
}

export function isSampleErrorPath(pathname: string): boolean {
  return pathname === SAMPLE_ERRORS_ROOT_PATH || pathname.startsWith(`${SAMPLE_ERRORS_ROOT_PATH}/`);
}

export function isSampleStandalonePath(pathname: string): boolean {
  return isSampleAuthPath(pathname) || isSampleErrorPath(pathname);
}

export function getSampleAccordionGroupForPath(
  pathname: string
): SampleAccordionNavValue | undefined {
  const accordionGroup = sampleAccordionNavGroups.find((group) =>
    group.items.some((item) => isSampleNavItemActive(pathname, item))
  );

  return accordionGroup?.value;
}

export function isSampleAuthChildRoute(pathname: string): boolean {
  return getSampleAccordionGroupForPath(pathname) === sampleAuthMenuItem.value;
}

export function isSampleErrorChildRoute(pathname: string): boolean {
  return getSampleAccordionGroupForPath(pathname) === sampleErrorsMenuItem.value;
}

export function getSampleRouteOpenAccordionGroups(pathname: string): SampleAccordionNavValue[] {
  const accordionGroup = getSampleAccordionGroupForPath(pathname);

  return accordionGroup ? [accordionGroup] : [];
}

export function getSampleSidebarOpenAccordionGroups(
  openGroups: readonly string[],
  routeOpenGroups: readonly string[]
): SampleAccordionNavValue[] {
  const nextOpenGroups = new Set(openGroups);
  const routeChildGroup = routeOpenGroups.find(isSampleAccordionNavValue);

  for (const group of routeOpenGroups) {
    nextOpenGroups.add(group);
  }

  if (routeChildGroup) {
    for (const candidateGroup of sampleAccordionNavValues) {
      if (candidateGroup !== routeChildGroup) {
        nextOpenGroups.delete(candidateGroup);
      }
    }
  }

  return sampleAccordionNavValues.filter((group) => nextOpenGroups.has(group));
}

function isSampleAccordionNavValue(value: string): value is SampleAccordionNavValue {
  return sampleAccordionNavValues.some((candidateGroup) => candidateGroup === value);
}

export function isSampleNavItemActive(pathname: string, item: SampleNavItem): boolean {
  const routePaths = [item.to, ...(item.aliases ?? [])];

  return routePaths.some(
    (routePath) => pathname === routePath || pathname.startsWith(`${routePath}/`)
  );
}

export function getSampleNavItem(pathname: string): SampleNavItem {
  return sampleNavItems.find((item) => isSampleNavItemActive(pathname, item)) ?? sampleNavItems[0];
}
