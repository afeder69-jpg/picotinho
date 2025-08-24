import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-start justify-center pt-16 px-6">
        <div className="text-center max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Bem-vindo ao Picotinho, a sua rede de preços
          </h1>
        </div>
      </div>
      
      {/* Bottom navigation */}
      <BottomNavigation />
      
      {/* Spacer for fixed bottom navigation */}
      <div className="h-20"></div>
    </div>
  );
};

export default Index;
