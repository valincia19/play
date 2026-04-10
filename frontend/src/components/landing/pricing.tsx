import React from "react"
import { RiCheckLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

export type PlanFeature = {
  label: string
  highlight?: boolean
}

export type Plan = {
  id: string
  name: string
  price: number
  features?: PlanFeature[]
}

export function Pricing() {
  const [plans, setPlans] = React.useState<Plan[]>([])

  React.useEffect(() => {
    async function fetchPlans() {
      try {
        const data = await api.getPlans()
        setPlans(data)
      } catch (err) {
        console.error("Failed to load plans:", err)
      }
    }
    fetchPlans()
  }, [])

  return (
    <section className="py-24 sm:py-32 bg-background border-y border-border">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-primary">Pricing</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Choose the right plan for you
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-muted-foreground">
          Whether you're just starting out or monetizing millions of views, Vercelplay has a plan that scales with your ambition.
        </p>

        <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8 lg:gap-y-0">
          {plans.map((plan) => {
            const isPopular = plan.id === 'creator'
            const buttonText = plan.id === 'free' ? 'Start for Free' : `Upgrade to ${plan.name}`

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-8 ring-1 xl:p-10 ${
                  isPopular
                    ? 'ring-primary shadow-2xl bg-card relative'
                    : 'ring-border bg-card/40'
                }`}
              >
                {isPopular && (
                  <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground font-semibold shadow-sm">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-x-4">
                  <h3 className={`text-lg font-semibold leading-8 ${isPopular ? 'text-primary' : 'text-foreground'}`}>
                    {plan.name}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{plan.name} features and limits.</p>
                <p className="mt-6 flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    Rp {plan.price.toLocaleString('id-ID')}
                  </span>
                  <span className="text-sm font-semibold leading-6 text-muted-foreground">/MO</span>
                </p>
                <Button
                  variant={isPopular ? "default" : "outline"}
                  className="mt-6 w-full"
                  size="lg"
                >
                  {buttonText}
                </Button>
                <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground xl:mt-10">
                  {plan.features?.map((feature, i: number) => (
                    <li key={i} className={`flex gap-x-3 ${feature.highlight ? 'text-foreground font-medium' : ''}`}>
                      <RiCheckLine className={`h-6 w-5 flex-none ${isPopular ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                      {feature.label}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
