import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { register } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/api/client';
import { validatePassword, validateEmail, validateUsername } from '@/types/user';
import { Loader2, Check, X } from 'lucide-react';

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  organization?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth, setLoading, setError, isLoading, error, clearError } = useAuthStore();
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organization, setOrganization] = useState('');
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Password validation state
  const passwordValidation = validatePassword(password);
  const passwordRequirements = [
    { met: password.length >= 8, text: 'At least 8 characters' },
    { met: /[A-Z]/.test(password), text: 'One uppercase letter' },
    { met: /[a-z]/.test(password), text: 'One lowercase letter' },
    { met: /[0-9]/.test(password), text: 'One number' },
  ];

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    
    // Validate username
    const usernameResult = validateUsername(username);
    if (!usernameResult.valid) {
      errors.username = usernameResult.errors[0];
    }
    
    // Validate email
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Validate password
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.errors[0];
    }
    
    // Validate password confirmation
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    // Organization is optional but validate length if provided
    if (organization && organization.length > 100) {
      errors.organization = 'Organization name must be 100 characters or less';
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
      const response = await register({
        username,
        email,
        password,
        organization: organization || undefined,
      });
      setAuth(response.user, response.jwt);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
        <CardDescription>Enter your details to create a new account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input 
              id="username" 
              type="text" 
              placeholder="johndoe"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setValidationErrors((prev) => ({ ...prev, username: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.username}
            />
            {validationErrors.username && (
              <p className="text-sm text-destructive">{validationErrors.username}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationErrors((prev) => ({ ...prev, email: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.email}
            />
            {validationErrors.email && (
              <p className="text-sm text-destructive">{validationErrors.email}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="organization">Organization (optional)</Label>
            <Input 
              id="organization" 
              type="text" 
              placeholder="My Company"
              value={organization}
              onChange={(e) => {
                setOrganization(e.target.value);
                setValidationErrors((prev) => ({ ...prev, organization: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.organization}
            />
            {validationErrors.organization && (
              <p className="text-sm text-destructive">{validationErrors.organization}</p>
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
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              disabled={isLoading}
              aria-invalid={!!validationErrors.password}
            />
            {(passwordFocused || password) && (
              <div className="mt-2 space-y-1">
                {passwordRequirements.map((req, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    {req.met ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
                      {req.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {validationErrors.password && (
              <p className="text-sm text-destructive">{validationErrors.password}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input 
              id="confirmPassword" 
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setValidationErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              disabled={isLoading}
              aria-invalid={!!validationErrors.confirmPassword}
            />
            {validationErrors.confirmPassword && (
              <p className="text-sm text-destructive">{validationErrors.confirmPassword}</p>
            )}
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </Button>
        </form>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
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
