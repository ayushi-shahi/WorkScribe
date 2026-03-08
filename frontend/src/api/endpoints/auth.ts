import apiClient from '@/api/client'
import type { AuthUser } from '@/types'

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  display_name: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  user: AuthUser
}

export interface RefreshResponse {
  access_token: string
}

export interface AcceptInviteRequest {
  display_name?: string
  password?: string
}

export interface InviteDetails {
  org_name: string
  org_slug: string
  role: string
  email: string
  inviter_name: string
}

export async function loginApi(data: LoginRequest): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/login', data)
  return res.data
}

export async function registerApi(data: RegisterRequest): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/register', data)
  return res.data
}

export async function logoutApi(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function refreshTokenApi(refreshToken: string): Promise<RefreshResponse> {
  const res = await apiClient.post<RefreshResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  })
  return res.data
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email })
}

export async function resetPasswordApi(token: string, password: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, new_password: password })
}

export async function getMeApi(): Promise<AuthUser> {
  const res = await apiClient.get<AuthUser>('/auth/me')
  return res.data
}

export async function getInviteDetailsApi(token: string): Promise<InviteDetails> {
  const res = await apiClient.get<InviteDetails>(`/auth/invitations/${token}`)
  return res.data
}

export async function acceptInviteApi(
  token: string,
  data: AcceptInviteRequest
): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>(
    `/auth/invitations/${token}/accept`,
    data
  )
  return res.data
}