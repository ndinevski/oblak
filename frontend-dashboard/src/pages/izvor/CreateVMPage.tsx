/**
 * Create VM Page
 * Multi-step wizard for creating a new virtual machine
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Server,
  Cpu,
  HardDrive,
  Key,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useCreateVM, useVMTemplates, useVMSizes } from '@/hooks/useVMs';
import { formatMemory, formatDisk, type VMSize } from '@/lib/api/vms';
import { cn } from '@/lib/utils';

interface FormData {
  // Step 1: Basic Info
  name: string;
  description: string;
  
  // Step 2: Template & Size
  template: string;
  size: VMSize;
  
  // Step 3: Custom Resources (if size is custom)
  cores: number;
  memoryMB: number;
  diskGB: number;
  
  // Step 4: Access & Tags
  sshKeys: string;
  cloudInitUser: string;
  tags: string[];
}

const initialFormData: FormData = {
  name: '',
  description: '',
  template: '',
  size: 'small',
  cores: 1,
  memoryMB: 1024,
  diskGB: 20,
  sshKeys: '',
  cloudInitUser: '',
  tags: [],
};

const steps = [
  { id: 1, name: 'Basic Info', icon: Server },
  { id: 2, name: 'Template & Size', icon: Cpu },
  { id: 3, name: 'Resources', icon: HardDrive },
  { id: 4, name: 'Access & Tags', icon: Key },
];

export default function CreateVMPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [tagInput, setTagInput] = useState('');
  
  const { data: templatesData, isLoading: templatesLoading } = useVMTemplates();
  const { data: sizesData } = useVMSizes();
  const createVMMutation = useCreateVM();
  
  const templates = templatesData?.data || [];
  const sizes = sizesData?.data || [];
  
  const selectedSize = sizes.find(s => s.name === formData.size);
  
  // Update form
  const updateForm = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };
  
  // Validate current step
  const validateStep = (): boolean => {
    switch (currentStep) {
      case 1:
        if (!formData.name.trim()) {
          toast({ title: 'Name is required', variant: 'destructive' });
          return false;
        }
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(formData.name) && formData.name.length > 1) {
          toast({ 
            title: 'Invalid name', 
            description: 'Name must start with a letter, contain only lowercase letters, numbers, and hyphens',
            variant: 'destructive' 
          });
          return false;
        }
        return true;
      case 2:
        if (!formData.template) {
          toast({ title: 'Please select a template', variant: 'destructive' });
          return false;
        }
        return true;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return true;
    }
  };
  
  // Navigation
  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };
  
  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };
  
  // Tags
  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      updateForm({ tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };
  
  const removeTag = (tag: string) => {
    updateForm({ tags: formData.tags.filter(t => t !== tag) });
  };
  
  // Submit
  const handleSubmit = async () => {
    try {
      const createData = {
        name: formData.name,
        description: formData.description || undefined,
        template: formData.template,
        size: formData.size,
        cores: formData.size === 'custom' ? formData.cores : undefined,
        memoryMB: formData.size === 'custom' ? formData.memoryMB : undefined,
        diskGB: formData.size === 'custom' ? formData.diskGB : undefined,
        cloudInit: formData.sshKeys || formData.cloudInitUser ? {
          user: formData.cloudInitUser || undefined,
          sshKeys: formData.sshKeys ? formData.sshKeys.split('\n').filter(k => k.trim()) : undefined,
        } : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
      };
      
      await createVMMutation.mutateAsync(createData);
      
      toast({
        title: 'VM Created',
        description: `${formData.name} is being provisioned...`,
      });
      
      navigate('/izvor/vms');
    } catch (err) {
      toast({
        title: 'Failed to create VM',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };
  
  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">VM Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateForm({ name: e.target.value.toLowerCase() })}
                placeholder="my-web-server"
                className="font-mono"
              />
              <p className="text-sm text-muted-foreground">
                Lowercase letters, numbers, and hyphens only. Must start with a letter.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="What is this VM for?"
                rows={3}
              />
            </div>
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label>Operating System Template *</Label>
              {templatesLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4 h-20 bg-muted" />
                    </Card>
                  ))}
                </div>
              ) : templates.length > 0 ? (
                <RadioGroup
                  value={formData.template}
                  onValueChange={(value) => updateForm({ template: value })}
                  className="grid grid-cols-2 gap-4"
                >
                  {templates.map((template) => (
                    <div key={template.id}>
                      <RadioGroupItem
                        value={template.id}
                        id={template.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={template.id}
                        className={cn(
                          "flex flex-col items-start gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors",
                          "peer-data-[state=checked]:border-primary",
                          "hover:bg-accent"
                        )}
                      >
                        <span className="font-medium">{template.name}</span>
                        <span className="text-sm text-muted-foreground">{template.description}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <Alert>
                  <AlertDescription>
                    No templates available. Using default sizes.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            <div className="space-y-4">
              <Label>VM Size</Label>
              <RadioGroup
                value={formData.size}
                onValueChange={(value) => updateForm({ size: value as VMSize })}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
              >
                {sizes.map((size) => (
                  <div key={size.name}>
                    <RadioGroupItem
                      value={size.name}
                      id={`size-${size.name}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`size-${size.name}`}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 cursor-pointer transition-colors text-center",
                        "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                        "hover:bg-accent"
                      )}
                    >
                      <span className="font-medium capitalize">{size.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {size.cores} vCPU
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMemory(size.memory)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDisk(size.disk)}
                      </span>
                    </Label>
                  </div>
                ))}
                <div>
                  <RadioGroupItem
                    value="custom"
                    id="size-custom"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="size-custom"
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3 cursor-pointer transition-colors text-center h-full",
                      "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                      "hover:bg-accent"
                    )}
                  >
                    <span className="font-medium">Custom</span>
                    <span className="text-xs text-muted-foreground">
                      Choose your own
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-6">
            {formData.size !== 'custom' && selectedSize ? (
              <Alert>
                <AlertDescription className="flex flex-col gap-2">
                  <span>Using <strong className="capitalize">{selectedSize.name}</strong> size:</span>
                  <span className="text-sm">
                    {selectedSize.cores} vCPU, {formatMemory(selectedSize.memory)}, {formatDisk(selectedSize.disk)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Select "Custom" size in the previous step to customize resources.
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>CPU Cores</Label>
                    <span className="text-sm font-medium">{formData.cores} vCPU</span>
                  </div>
                  <Slider
                    value={[formData.cores]}
                    onValueChange={([value]) => updateForm({ cores: value })}
                    min={1}
                    max={16}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1 vCPU</span>
                    <span>16 vCPU</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>Memory</Label>
                    <span className="text-sm font-medium">{formatMemory(formData.memoryMB)}</span>
                  </div>
                  <Slider
                    value={[formData.memoryMB]}
                    onValueChange={([value]) => updateForm({ memoryMB: value })}
                    min={256}
                    max={16384}
                    step={256}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>256 MB</span>
                    <span>16 GB</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>Disk Size</Label>
                    <span className="text-sm font-medium">{formatDisk(formData.diskGB)}</span>
                  </div>
                  <Slider
                    value={[formData.diskGB]}
                    onValueChange={([value]) => updateForm({ diskGB: value })}
                    min={5}
                    max={500}
                    step={5}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>5 GB</span>
                    <span>500 GB</span>
                  </div>
                </div>
              </>
            )}
          </div>
        );
        
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="cloudInitUser">Default User</Label>
              <Input
                id="cloudInitUser"
                value={formData.cloudInitUser}
                onChange={(e) => updateForm({ cloudInitUser: e.target.value })}
                placeholder="ubuntu"
              />
              <p className="text-sm text-muted-foreground">
                Username for SSH access
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sshKeys">SSH Public Keys</Label>
              <Textarea
                id="sshKeys"
                value={formData.sshKeys}
                onChange={(e) => updateForm({ sshKeys: e.target.value })}
                placeholder="ssh-rsa AAAA... user@example.com"
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                One key per line. Keys will be added to the default user.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add tag..."
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  <Tag className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTag(tag)}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/izvor/vms')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Virtual Machine</h1>
          <p className="text-muted-foreground">
            Launch a new VM on Izvor
          </p>
        </div>
      </div>
      
      {/* Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  currentStep > step.id
                    ? "bg-primary text-primary-foreground"
                    : currentStep === step.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {currentStep > step.id ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <step.icon className="h-5 w-5" />
                )}
              </div>
              <span className={cn(
                "text-xs font-medium hidden sm:block",
                currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.name}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "w-12 md:w-24 h-0.5 mx-2",
                  currentStep > step.id ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>
      
      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const StepIcon = steps[currentStep - 1].icon;
              return <StepIcon className="h-5 w-5" />;
            })()}
            {steps[currentStep - 1].name}
          </CardTitle>
          <CardDescription>
            Step {currentStep} of {steps.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStepContent()}
        </CardContent>
      </Card>
      
      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 1}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        
        {currentStep < 4 ? (
          <Button onClick={nextStep}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createVMMutation.isPending}
          >
            {createVMMutation.isPending ? 'Creating...' : 'Create VM'}
          </Button>
        )}
      </div>
    </div>
  );
}
