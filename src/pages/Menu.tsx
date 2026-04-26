import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PicotinhoLogo from "@/components/PicotinhoLogo";
import { 
  FileImage, 
  ChevronRight, 
  Package, 
  TrendingDown, 
  BarChart3, 
  ChefHat, 
  ShoppingCart,
  LogIn,
  LogOut,
  MapPin,
  Settings,
  Database,
  Shield,
  Calendar,
  Search
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Menu = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isMaster, setIsMaster] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userNickname, setUserNickname] = useState<string>('');


          <div className="space-y-3">
            {menuOptions.map((option) => (
              <Card 
                key={option.id}
                className={`transition-all duration-200 hover:shadow-md ${
                  option.isActive ? 'cursor-pointer' : 'cursor-default opacity-75'
                }`}
                onClick={option.isActive ? option.onClick : undefined}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-full ${
                        option.isActive ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <option.icon className={`w-6 h-6 ${
                          option.isActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <h3 className={`font-semibold ${
                          option.isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {option.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                        {!option.isActive && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Em breve
                          </p>
                        )}
                      </div>
                    </div>
                    {option.isActive && (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          
          {/* Mensagem informativa */}
          <div className="mt-6 p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-sm">
              Novas funcionalidades serão adicionadas em breve
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu;