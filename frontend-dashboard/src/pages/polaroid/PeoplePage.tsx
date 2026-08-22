import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ChevronLeft, Users, Eye, EyeOff, MoreVertical, Pencil
} from "lucide-react";
import {
  Button, Card, CardContent, 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  Switch, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui";

import { usePeople, useUpdatePerson } from "@/hooks/usePolaroid";
import { PolaroidPerson } from "@/lib/api/polaroid";
import { PersonImage } from "@/components/polaroid/AuthenticatedImage";

export default function PeoplePage() {
  const navigate = useNavigate();
  const [showHidden, setShowHidden] = useState(false);
  
  const { data: people, isLoading, isError } = usePeople({ withHidden: true });
  const updateMutation = useUpdatePerson();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [personToEdit, setPersonToEdit] = useState<PolaroidPerson | null>(null);
  const [editName, setEditName] = useState("");

  const filteredPeople = people?.people.filter((p: PolaroidPerson) => showHidden || !p.isHidden) || [];

  const handleEditOpen = (person: PolaroidPerson, e: React.MouseEvent) => {
    e.stopPropagation();
    setPersonToEdit(person);
    setEditName(person.name);
    setEditDialogOpen(true);
  };

  const handleEditSave = () => {
    if (personToEdit && editName.trim()) {
      updateMutation.mutate({
        personId: personToEdit.id,
        data: { name: editName }
      }, {
        onSuccess: () => {
          setEditDialogOpen(false);
          setPersonToEdit(null);
        }
      });
    }
  };

  const handleToggleHidden = (person: PolaroidPerson, e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate({
      personId: person.id,
      data: { isHidden: !person.isHidden }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/photos"><ChevronLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">People</h1>
            <p className="text-muted-foreground">Find photos of your friends and family</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="show-hidden" className="text-sm text-muted-foreground cursor-pointer">
            Show hidden
          </Label>
          <Switch 
            id="show-hidden" 
            checked={showHidden} 
            onCheckedChange={setShowHidden} 
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex flex-col items-center space-y-3">
              <Skeleton className="w-24 h-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load people. Please try again.</AlertDescription>
        </Alert>
      ) : filteredPeople.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Users className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">No people found</h3>
              <p className="text-muted-foreground max-w-sm">
                Upload photos with faces and they will appear here automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {filteredPeople.map((person: PolaroidPerson) => (
            <div 
              key={person.id}
              onClick={() => navigate(`/photos/people/${person.id}`)}
              className="group cursor-pointer flex flex-col items-center space-y-2 relative"
            >
                <div className="relative">
                <PersonImage
                  personId={person.id}
                  alt={person.name}
                  className={`w-24 h-24 rounded-full object-cover border-2 border-transparent group-hover:border-primary transition-all ${person.isHidden ? 'opacity-50 grayscale' : ''}`}
                  loading="lazy"
                />
                <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-white hover:bg-black/70">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => handleEditOpen(person, e)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleToggleHidden(person, e)}>
                        {person.isHidden ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                        {person.isHidden ? "Unhide" : "Hide"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="text-center">
                <h3 className="font-medium text-sm truncate w-24 group-hover:text-primary transition-colors">
                  {person.name || "Unknown"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {person.name || "Unknown"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Person</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center mb-4">
              {personToEdit && (
                <PersonImage
                  personId={personToEdit.id}
                  alt={personToEdit.name}
                  className="w-24 h-24 rounded-full object-cover border"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
                placeholder="Enter a name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editName.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
