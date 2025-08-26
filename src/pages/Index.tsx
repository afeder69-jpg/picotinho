import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md mx-auto space-y-8">
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Bem-vindo ao Picotinho, a sua rede compartilhada de preços
          </h1>
          
          {/* Red circle in center */}
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-red-500 rounded-full animate-pulse shadow-lg"></div>
          </div>
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
