export interface AuthUser {
  email: string;
  role: 'USER' | 'ADMIN';
}

export interface AuthResponse {
  user: {
    name: string;
    email: string;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}
