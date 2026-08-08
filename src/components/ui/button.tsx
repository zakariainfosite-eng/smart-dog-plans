import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * CynoPlanning unified button system.
 * Use only these variants — do not override colors with one-off classNames.
 *
 * Sizes:
 * - default / lg: primary page actions (42px)
 * - sm: compact card / row actions (34px)
 * - icon / icon-sm: square icon-only controls
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center whitespace-nowrap",
    "font-semibold leading-none",
    "cursor-pointer select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023A84]/35 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "active:scale-[0.98]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[#023A84] text-white shadow-sm hover:bg-[#0349A5] active:bg-[#012E68]",
        primary:
          "border border-transparent bg-[#023A84] text-white shadow-sm hover:bg-[#0349A5] active:bg-[#012E68]",
        secondary:
          "border border-[#D1D5DB] bg-white text-[#374151] shadow-none hover:bg-[#F8FAFC] active:bg-[#F1F5F9]",
        outline:
          "border border-[#D1D5DB] bg-white text-[#374151] shadow-none hover:bg-[#F8FAFC] active:bg-[#F1F5F9]",
        destructive:
          "border border-transparent bg-[#DC2626] text-white shadow-none hover:bg-[#B91C1C] active:bg-[#991B1B]",
        danger:
          "border border-transparent bg-[#DC2626] text-white shadow-none hover:bg-[#B91C1C] active:bg-[#991B1B]",
        success:
          "border border-transparent bg-[#16A34A] text-white shadow-sm hover:bg-[#15803D] active:bg-[#166534]",
        warning:
          "border border-transparent bg-[#F59E0B] text-white shadow-sm hover:bg-[#D97706] active:bg-[#B45309]",
        ghost:
          "border border-transparent bg-transparent text-[#374151] shadow-none hover:bg-[#F8FAFC] active:bg-[#F1F5F9]",
        link:
          "h-auto rounded-none border-0 bg-transparent px-0 text-[#023A84] shadow-none underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-[42px] gap-2 rounded-[10px] px-[18px] text-sm [&_svg]:size-4",
        sm: "h-[34px] gap-1.5 rounded-lg px-[14px] text-[13px] [&_svg]:size-[15px]",
        lg: "h-[42px] gap-2 rounded-[10px] px-6 text-sm [&_svg]:size-4",
        icon: "h-[42px] w-[42px] gap-0 rounded-[10px] px-0 [&_svg]:size-4",
        "icon-sm": "h-[34px] w-[34px] gap-0 rounded-lg px-0 [&_svg]:size-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
