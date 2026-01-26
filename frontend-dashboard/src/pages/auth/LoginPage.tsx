import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { login } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth, setLoading, setError, isLoading, error, clearError } = useAuthStore();
  
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    identifier?: string;
    password?: string;
  }>({});

  const validateForm = (): boolean => {
    const errors: typeof validationErrors = {};
    
    if (!identifier.trim()) {
      errors.identifier = 'Email or username is required';
    }
    
    if (!password) {
      errors.password = 'Password is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await login({ identifier, password });
      setAuth(response.user, response.jwt);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
        <CardDescription>Enter your credentials to access your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or Username</Label>
            <Input 
              id="identifier" 
              type="text" 
              placeholder="name@example.com"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setValidationErrors((prev) => ({ ...prev, identifier: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.identifier}
            />
            {validationErrors.identifier && (
              <p className="text-sm text-destructive">{validationErrors.identifier}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setValidationErrors((prev) => ({ ...prev, password: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.password}
            />
            {validationErrors.password && (
              <p className="text-sm text-destructive">{validationErrors.password}</p>
            )}
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>
        
        <div className="mt-4 text-center text-sm">
          <Link 
            to="/auth/forgot-password" 
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link 
            to="/auth/register" 
            className="font-medium text-foreground hover:underline"
          >
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
