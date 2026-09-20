import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, Inject, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, TimeoutError, timeout } from 'rxjs';

// INTERFACE: bentuk respons login yang diharapkan dari API Python.
interface LoginResponse {
  access_token: string;
  expires_at: string;
  user: { username: string; display_name: string };
}

// DECORATOR: sambungkan class Auth ke HTML/CSS login dan aktifkan binding form.
@Component({
  selector: 'app-auth',
  imports: [FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
// CLASS KOMPONEN: mengatur perilaku halaman login, bukan memeriksa password di database.
export class Auth {
  // STATE/PROPERTY: data input dan status UI yang dibaca oleh auth.html.
  username = '';
  password = '';
  errorMessage = '';
  hasAttemptedSubmit = false;
  isSubmitting = false;
  passwordVisible = false;

  // Register form fields
  registerName = '';
  registerEmail = '';
  registerEmailVerify = '';
  registerPassword = '';
  registerPasswordVerify = '';
  registerError = '';

  // CONSTANT MILIK INSTANCE: batas tunggu login; private berarti dipakai di dalam class.
  private readonly loginTimeoutMs = 15_000;

  // CONSTRUCTOR: Angular menyediakan HTTP, router, lifecycle, pembaruan view, dan platform.
  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
    private readonly changeDetector: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  // GETTER: menghasilkan label dari state saat ini; template membacanya seperti property.
  get statusLabel(): string {
    if (this.isSubmitting) return 'VERIFYING IDENTITY';
    if (this.errorMessage || this.registerError) return 'CHECK FAILED';
    return 'SYSTEM ONLINE';
  }

  // METHOD EVENT FORM: validasi input, kirim POST login, lalu tangani sukses/gagal.
  // Form dikunci selama request dan selalu dibuka kembali melalui finalize.
  submit(): void {
    if (!isPlatformBrowser(this.platformId) || this.isSubmitting) return;

    this.hasAttemptedSubmit = true;
    this.username = this.username.trim();
    this.errorMessage = this.validateLoginCredentials();
    if (this.errorMessage) return;

    this.isSubmitting = true;
    const backendUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
    this.http
      .post<LoginResponse>(`${backendUrl}/api/auth/login`, {
        username: this.username,
        password: this.password,
      })
      .pipe(
        timeout({ first: this.loginTimeoutMs }),
        takeUntilDestroyed(this.destroyRef),
        // FINALIZER CALLBACK: buka kembali form saat sukses, error, timeout,
        // maupun pembatalan subscription ketika komponen dilepas.
        finalize(() => {
          this.isSubmitting = false;
          this.changeDetector.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => this.completeLogin(response),
        error: (error: unknown) => (this.errorMessage = this.describeLoginError(error)),
      });
  }

  // METHOD EVENT REGISTER: validasi dan submit registration form
  register(): void {
    if (!isPlatformBrowser(this.platformId) || this.isSubmitting) return;

    this.registerError = this.validateRegistration();
    if (this.registerError) return;

    this.isSubmitting = true;
    const backendUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
    this.http
      .post(`${backendUrl}/api/auth/register`, {
        username: this.registerName.trim(),
        email: this.registerEmail.trim(),
        password: this.registerPassword,
      })
      .pipe(
        timeout({ first: this.loginTimeoutMs }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.changeDetector.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          // Auto-fill login form after successful registration
          this.username = this.registerName.trim();
          this.password = this.registerPassword;
          this.registerName = '';
          this.registerEmail = '';
          this.registerEmailVerify = '';
          this.registerPassword = '';
          this.registerPasswordVerify = '';
          this.registerError = '';
        },
        error: (error: unknown) => (this.registerError = this.describeRegisterError(error)),
      });
  }

  // METHOD EVENT TOMBOL: isi akun demo untuk development; belum mengirim login.
  useDevelopmentCredentials(): void {
    if (this.isSubmitting) return;
    this.username = 'user1';
    this.password = 'user132';
    this.hasAttemptedSubmit = false;
    this.errorMessage = '';
  }

  // METHOD EVENT TOMBOL: tampilkan atau sembunyikan teks password.
  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
  }

  // METHOD EVENT INPUT: hapus pesan error lama ketika pengguna mengubah input.
  clearError(): void {
    if (this.errorMessage) this.errorMessage = '';
  }

  // PRIVATE METHOD: validasi login credentials
  private validateLoginCredentials(): string {
    if (!this.username && !this.password) return 'ENTER USERNAME AND PASSWORD.';
    if (!this.username) return 'USERNAME REQUIRED.';
    if (!this.password) return 'PASSWORD REQUIRED.';
    return '';
  }

  // PRIVATE METHOD: validasi registration form
  private validateRegistration(): string {
    if (!this.registerName) return 'DETECTIVE NAME REQUIRED.';
    if (!this.registerEmail) return 'EMAIL REQUIRED.';
    if (!this.registerEmailVerify) return 'VERIFY EMAIL REQUIRED.';
    if (this.registerEmail !== this.registerEmailVerify) return 'EMAIL MISMATCH.';
    if (!this.registerPassword) return 'PASSWORD REQUIRED.';
    if (!this.registerPasswordVerify) return 'VERIFY PASSWORD REQUIRED.';
    if (this.registerPassword !== this.registerPasswordVerify) return 'PASSWORD MISMATCH.';
    if (this.registerPassword.length < 6) return 'PASSWORD TOO SHORT (MIN 6).';
    return '';
  }

  // PRIVATE METHOD: periksa respons, simpan sesi lokal, lalu buka main page.
  private completeLogin(response: LoginResponse): void {
    if (!response.access_token || !response.expires_at || !response.user?.username) {
      this.errorMessage = 'INCOMPLETE RESPONSE. TRY AGAIN.';
      return;
    }

    try {
      localStorage.setItem('silent_terror_access_token', response.access_token);
      localStorage.setItem('silent_terror_access_token_expires_at', response.expires_at);
      localStorage.setItem('silent_terror_user', JSON.stringify(response.user));
      sessionStorage.removeItem('silent_terror_game_entry');
    } catch {
      this.errorMessage = 'STORAGE DENIED. ENABLE STORAGE.';
      return;
    }

    this.password = '';
    void this.router.navigateByUrl('/main').catch(() => {
      this.errorMessage = 'LOGIN SUCCESSFUL, MAIN PAGE FAILED.';
    });
  }

  // PRIVATE METHOD: ubah jenis error HTTP/timeout menjadi pesan yang bisa dipahami pengguna (login).
  private describeLoginError(error: unknown): string {
    if (error instanceof TimeoutError) return 'SERVER TIMEOUT. RETRY.';
    if (!(error instanceof HttpErrorResponse)) return 'UNEXPECTED ERROR. RETRY.';
    if (error.status === 0) return 'CANNOT CONNECT. CHECK CONNECTION.';
    if (error.status === 400 || error.status === 422)
      return 'INVALID DATA. CHECK INPUT.';
    if (error.status === 401) return 'WRONG USERNAME OR PASSWORD.';
    if (error.status === 429) return 'TOO MANY ATTEMPTS. WAIT.';
    if (error.status >= 500) return 'SERVER ERROR. RETRY.';
    return 'LOGIN FAILED. TRY AGAIN.';
  }

  // PRIVATE METHOD: ubah jenis error HTTP/timeout menjadi pesan yang bisa dipahami pengguna (register).
  private describeRegisterError(error: unknown): string {
    if (error instanceof TimeoutError) return 'SERVER TIMEOUT. RETRY.';
    if (!(error instanceof HttpErrorResponse)) return 'UNEXPECTED ERROR. RETRY.';
    if (error.status === 0) return 'CANNOT CONNECT. CHECK CONNECTION.';
    if (error.status === 400 || error.status === 422)
      return 'INVALID DATA. CHECK INPUT.';
    if (error.status === 409) return 'USER ALREADY EXISTS.';
    if (error.status >= 500) return 'SERVER ERROR. RETRY.';
    return 'REGISTRATION FAILED. TRY AGAIN.';
  }
}
