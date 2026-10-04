import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const TOKEN_KEY = 'assetflow_token';
export const USER_KEY = 'assetflow_current_user';

/**
 * Attaches the JWT as a Bearer token on every /api request. Expired authenticated
 * requests return to sign-in; a rejected login stays on the page to show its error.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthAttempt = req.url.includes('/auth/login') || req.url.includes('/auth/reset');
      if (err.status === 401 && token && !isAuthAttempt) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        // Full reload drops all in-memory state and shows the login screen.
        if (location.pathname !== '/' || location.hash) location.assign('/');
        else location.reload();
      }
      return throwError(() => err);
    })
  );
};
