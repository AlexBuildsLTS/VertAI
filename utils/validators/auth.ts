/**
 * utils/validators/auth.ts
 * VeraxAI — Authentication Validation
 * ----------------------------------------------------------------------------
 * MODULE OVERVIEW:
 * Evaluates user input against strict security parameters before hitting the
 * Supabase, Delivers friendly, and professional error messages
 * ----------------------------------------------------------------------------
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * RFC 5322 compliant email regex for robust format verification.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Password requirements for enterprise security:
 * - Minimum 10 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const PASSWORD_CHECKS = [
  {
    test: (p: string) => p.length >= 10,
    error: 'Password must be at least 10 characters long.',
  },
  {
    test: (p: string) => /[A-Z]/.test(p),
    error: 'Password must contain at least one uppercase letter.',
  },
  {
    test: (p: string) => /[a-z]/.test(p),
    error: 'Password must contain at least one lowercase letter.',
  },
  {
    test: (p: string) => /\d/.test(p),
    error: 'Password must contain at least one number.',
  },
  {
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
    error: 'Password must contain at least one special character.',
  },
] as const;

export const AuthValidator = {
  /**
   * Performs a silent boolean check on email format.
   */
  isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
  },

  /**
   * Validates email and returns a user-friendly error message if invalid.
   */
  validateEmail(email: string): ValidationResult {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Please enter your email address.' };
    }
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Email address cannot be empty.' };
    }
    if (trimmed.length > 254) {
      return { valid: false, error: 'This email address is too long.' };
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid email address.' };
    }
    return { valid: true };
  },

  /**
   * Performs a silent boolean check on password strength.
   */
  isValidPassword(password: string): boolean {
    if (!password || typeof password !== 'string') return false;
    return PASSWORD_CHECKS.every((check) => check.test(password));
  },

  /**
   * Validates password strength and returns specific, actionable feedback.
   */
  validatePassword(password: string): ValidationResult {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Please enter a password.' };
    }
    for (const check of PASSWORD_CHECKS) {
      if (!check.test(password)) {
        return { valid: false, error: check.error };
      }
    }
    if (password.length > 128) {
      return { valid: false, error: 'This password exceeds the maximum length.' };
    }
    return { valid: true };
  },

  /**
   * Performs a silent boolean check on display name.
   */
  isValidName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  },

  /**
   * Validates user's full name with friendly feedback.
   */
  validateName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Please enter your full name.' };
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Your name must be at least 2 characters long.' };
    }
    if (trimmed.length > 100) {
      return { valid: false, error: 'Your name cannot exceed 100 characters.' };
    }
    return { valid: true };
  },

  /**
   * Validates username formatting (if applicable to the platform).
   */
  validateUsername(username: string): ValidationResult {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Please choose a username.' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters long.' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { valid: false, error: 'Usernames can only contain letters, numbers, and underscores.' };
    }
    return { valid: true };
  },

  /**
   * Ensures the user typed the exact same password twice during registration.
   */
  validatePasswordMatch(password: string, confirm: string): ValidationResult {
    if (password !== confirm) {
      return { valid: false, error: 'Passwords do not match.' };
    }
    return { valid: true };
  },

  /**
   * Master validation runner for the Sign-Up flow.
   * Runs all checks in sequence and returns the first failure encountered.
   */
  validateSignUp(
    email: string,
    password: string,
    confirmPassword: string,
    name: string,
    username?: string
  ): ValidationResult {
    const emailResult = this.validateEmail(email);
    if (!emailResult.valid) return emailResult;

    const nameResult = this.validateName(name);
    if (!nameResult.valid) return nameResult;

    if (username) {
      const userResult = this.validateUsername(username);
      if (!userResult.valid) return userResult;
    }

    const passwordResult = this.validatePassword(password);
    if (!passwordResult.valid) return passwordResult;

    const matchResult = this.validatePasswordMatch(password, confirmPassword);
    if (!matchResult.valid) return matchResult;

    return { valid: true };
  },

  /**
   * Master validation runner for the Sign-In flow.
   * Keeps checks minimal to prevent exposing account enumeration via detailed errors.
   */
  validateSignIn(email: string, password: string): ValidationResult {
    const emailResult = this.validateEmail(email);
    if (!emailResult.valid) return emailResult;

    if (!password || password.length === 0) {
      return { valid: false, error: 'Please enter your password to sign in.' };
    }

    return { valid: true };
  },
};

export default AuthValidator;