import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState("")

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

  const handleChangePassword = async () => {
    // Validation
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long")
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match")
      return
    }

    try {
      setIsChangingPassword(true)
      setPasswordError("")
      setPasswordSuccess("")

      await api.changePassword({
        currentPassword,
        newPassword
      })

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordSuccess("Password changed successfully!")

      // Clear success message after 3 seconds
      setTimeout(() => setPasswordSuccess(""), 3000)
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message)
      } else {
        setPasswordError("Failed to change password")
      }
    } finally {
      setIsChangingPassword(false)
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account profile and security settings.
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </div>
      )}
  
      <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Display Name</CardTitle>
              <CardDescription>This is your visible name on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
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

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password to keep it secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isChangingPassword}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isChangingPassword}
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters long.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isChangingPassword}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="w-full"
                >
                  {isChangingPassword && <RiLoader4Line className="mr-2 size-4 animate-spin" />}
                  Change Password
                </Button>
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600">{passwordSuccess}</p>
                )}
              </form>
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
  )
}
