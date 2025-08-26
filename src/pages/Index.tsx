import BottomNavigation from "@/components/BottomNavigation";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center pt-16 px-6">
        <div className="text-center max-w-md mx-auto relative">
          <h1 className="text-4xl font-bold text-red-500 leading-tight mb-8 animate-pulse">
            🔴 VERSÃO TESTE ATUALIZADA 🔴
          </h1>
          
          {/* TRÊS BOLINHAS COLORIDAS PARA GARANTIR QUE VOCÊ VÊ */}
          <div className="flex justify-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-red-500 rounded-full animate-bounce"></div>
            <div className="w-16 h-16 bg-blue-500 rounded-full animate-spin"></div>
            <div className="w-16 h-16 bg-yellow-500 rounded-full animate-pulse"></div>
          </div>
          
          <div className="bg-red-500 text-white p-6 rounded-lg font-bold text-xl animate-bounce">
            ⚡ SE VOCÊ VÊ ISSO, FUNCIONOU! ⚡
          </div>
          
          <p className="text-lg text-foreground mt-4 font-bold">
            Três bolinhas coloridas + texto em destaque
          </p>
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
