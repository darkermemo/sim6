# Centralized Radius Management Examples

## 🎯 **Three Levels of Control**

### **1. Global Control (All Components)**
Change the entire app's radius from one place:

```css
/* src/styles/tokens.css */
:root { 
  --radius: 1rem;     /* More rounded */
  --radius: 0.25rem;  /* Sharp corners */
  --radius: 0.75rem;  /* Default (current) */
}
```
→ **Affects**: All shadcn components (Button, Input, Card, Dialog, etc.)

### **2. Component-Level Control (Buttons Only)**
Override just buttons without affecting inputs/cards:

```tsx
// Change ALL buttons to pills
const buttonVariants = cva("...", {
  defaultVariants: { 
    shape: "pill"  // ← Change this one line
  }
});

// Or use per-instance
// NOTE: These are documentation examples - not functional UI elements
<Button shape="pill">Pill Button</Button>
<Button shape="square">Square Button</Button>
<Button shape="soft">Soft Button</Button>
```

### **3. Scoped Override (Per Section)**
Override radius for a specific area:

```tsx
// Local override - affects all components inside
<div style={{ ["--radius" as any]: "1.5rem" }}>
  <Button>Rounded button</Button>  {/* Documentation example */}
  <Input />  {/* Also gets 1.5rem radius */}
  <Card />   {/* Also gets 1.5rem radius */}
</div>
```

## 🎛️ **Available Shape Variants**

```tsx
<!-- Documentation examples - not functional UI elements -->
<Button shape="rounded">Default</Button>   {/* uses --radius-md */}
<Button shape="pill">Pill Shape</Button>   {/* fully rounded */}
<Button shape="square">Sharp</Button>      {/* no radius */}
<Button shape="soft">Subtle</Button>       {/* uses --radius-sm */}
<Button shape="extra">Extra Round</Button> {/* uses --radius-lg */}
```

## 🔧 **Token Hierarchy**

```css
--radius: 0.75rem              /* base - change this to control all */
--radius-sm: calc(var(--radius) - 4px)   /* subtle corners */
--radius-md: calc(var(--radius) - 2px)   /* default */
--radius-lg: var(--radius)               /* base radius */
--radius-xl: calc(var(--radius) + 4px)   /* more rounded */
--radius-2xl: calc(var(--radius) + 8px)  /* very rounded */
```

## 🎨 **Tailwind Mapping**

```css
rounded-sm  → var(--radius-sm)
rounded-md  → var(--radius-md)  
rounded-lg  → var(--radius-lg)
rounded-xl  → var(--radius-xl)
rounded-2xl → var(--radius-2xl)
```

**Result**: Change `--radius` once → entire app reshapes!
