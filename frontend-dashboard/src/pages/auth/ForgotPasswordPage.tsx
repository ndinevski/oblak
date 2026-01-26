import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { forgotPassword } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/api/client';
import { validateEmail } from '@/types/user';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);
    
    // Validate email
    if (!email.trim()) {
      setValidationError('Email is required');
      return;
    }
    
    if (!validateEmail(email)) {
      setValidationError('Please enter a valid email address');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await forgotPassword({ email });
      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">Check your email</CardTitle>
          <CardDescription className="text-center">
            We've sent a password reset link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center mb-4">
            If you don't see it, check your spam folder. The link will expire in 24 hours.
          </p>
          <div className="text-center">
            <Link 
              to="/auth/login" 
              className="text-sm font-medium hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
        <CardDescription>Enter your email to receive a password reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationError(null);
              }}
              disabled={isLoading}
              aria-invalid={!!validationError}
            />
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Reset Link'
            )}
          </Button>
        </form>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link 
            to="/auth/login" 
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
