import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { api, ApiError } from "@/lib/api"
import { useNavigate } from "react-router-dom"
import { RiLoader4Line } from "@remixicon/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function DashboardSettings() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  
  const [name, setName] = useState(user?.name || "")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  // Update local state if user context updates
  useEffect(() => {
    if (user?.name) {
      setName(user.name)
    }
  }, [user])

  const handleSave = async () => {
    if (!name.trim() || name === user?.name) return

    try {
      setIsSaving(true)
      setMessage(null)
      await api.updateMe({ name })
      await refreshUser()
      setMessage({ text: "Profile updated successfully.", type: "success" })
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ text: err.message, type: "error" })
      } else {
        setMessage({ text: "An unexpected error occurred.", type: "error" })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await api.deleteMe()
      logout()
      navigate("/login")
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ text: err.message, type: "error" })
      } else {
        setMessage({ text: "Failed to delete account.", type: "error" })
      }
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal information and account security.
          </p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </div>
      )}
      
      <div className="grid gap-6 md:grid-cols-[200px_1fr] lg:grid-cols-[250px_1fr]">
        <nav className="flex flex-col gap-1 text-sm text-muted-foreground">
          <a href="#" className="font-medium text-foreground px-3 py-2 bg-muted rounded-md">General</a>
          <a href="#" className="px-3 py-2 hover:bg-muted/50 hover:text-foreground rounded-md transition-colors flex items-center justify-between">
            Security 
            <span className="text-[10px] uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">Soon</span>
          </a>
          <a href="#" className="px-3 py-2 hover:bg-muted/50 hover:text-foreground rounded-md transition-colors flex items-center justify-between">
            Billing
            <span className="text-[10px] uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">Soon</span>
          </a>
        </nav>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Display Name</CardTitle>
              <CardDescription>This is your visible name on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex max-w-md items-center gap-4">
                <Input 
                  type="text" 
                  placeholder="John Doe" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSaving}
                />
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || name === user?.name || !name.trim()}
                >
                  {isSaving && <RiLoader4Line className="mr-2 size-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Address</CardTitle>
              <CardDescription>Your email address is used for login and notifications.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-md">
                <Input 
                  type="email" 
                  value={user?.email || ""}
                  disabled
                  className="bg-muted opacity-50 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Email addresses cannot be changed at this moment. You must create a new account.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">Delete Account</CardTitle>
              <CardDescription>
                Permanently remove your account and all its data. This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeleting}>
                    {isDeleting && <RiLoader4Line className="mr-2 size-4 animate-spin" />}
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently soft-delete your
                      account and remove your data from our active servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
