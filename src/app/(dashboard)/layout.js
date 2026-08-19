import { DashboardLayout } from "@/shared/components";
import { BrandingProvider } from "@/shared/components/BrandingContext";

export default function DashboardRootLayout({ children }) {
  return (
    <BrandingProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </BrandingProvider>
  );
}
