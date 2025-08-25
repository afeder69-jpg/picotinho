import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center pt-16 px-6">
        <div className="text-center max-w-md mx-auto relative">
          <h1 className="text-2xl font-bold text-foreground leading-tight mb-8">
            Bem-vindo ao Picotinho, a sua rede compartilhada de preços
          </h1>
          
          {/* Bolinha de teste - AZUL desta vez */}
          <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto animate-pulse shadow-lg"></div>
          <p className="text-sm text-muted-foreground mt-2">Teste de atualização - Azul</p>
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
