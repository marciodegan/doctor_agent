import React, { useState, useEffect } from "react";
import { Check, Sparkles, Zap, Shield, ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../hooks/useAuth";

interface PricingProps {
  onBack: () => void;
}

export function Pricing({ onBack }: PricingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{ subscribed: boolean; configured: boolean; error?: string } | null>(null);
  const { isAuthenticated, login } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/stripe/status")
        .then(res => res.json())
        .then(data => setStripeStatus(data))
        .catch(err => console.error("Error fetching stripe status:", err));
    }
  }, [isAuthenticated]);

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      login();
      return;
    }

    setIsLoading(true);
    try {
      const priceId = (import.meta as any).env.VITE_STRIPE_PRICE_ID;
      if (!priceId) {
        alert("VITE_STRIPE_PRICE_ID não configurado no ambiente.");
        return;
      }

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Erro ao iniciar checkout.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro na conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManage = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Erro ao abrir portal de gerenciamento.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro na conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <motion.button 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="self-start mb-8 flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-medium text-sm"
      >
        <ArrowLeft size={16} />
        Voltar ao Workspace
      </motion.button>

      <div className="max-w-4xl w-full text-center space-y-4 mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold tracking-tight uppercase border border-blue-100 mb-4"
        >
          <Sparkles size={12} />
          Doctor Agent
        </motion.div>
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tighter"
        >
          Poder de verdade para o seu <br />
          <span className="text-blue-600 underline decoration-blue-200 decoration-8 underline-offset-4">Negócio Inteligente.</span>
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-gray-500 text-lg max-w-2xl mx-auto"
        >
          Elimine tarefas manuais e escale sua operação com o Doctor Agent. 
          Gerenciamento ilimitado e insights automáticos.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 max-w-lg w-full gap-8">
        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.3 }}
           className="relative bg-white border-2 border-blue-600 rounded-[2.5rem] p-10 shadow-2xl shadow-blue-500/10 flex flex-col"
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
            Plano Mensal
          </div>

          <div className="mb-10 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Doctor Agent</h3>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-gray-400 text-lg font-medium">R$</span>
              <span className="text-6xl font-black text-gray-900 tracking-tighter">149</span>
              <span className="text-gray-500 font-medium">/mês</span>
            </div>
          </div>

          <div className="space-y-4 mb-10 flex-1">
            <Feature item="Pacientes Ilimitados" />
            <Feature item="Integração Total com Google Workspace" />
            <Feature item="IA Sem Limites de Mensagens" />
            <Feature item="Dashboard de Status em Tempo Real" />
            <Feature item="Gerenciamento de Contatos e Informações" />
            <Feature item="Backup Automático Diário" />
            <Feature item="Suporte Prioritário 24/7" />
          </div>

          {!stripeStatus?.subscribed ? (
            <button 
              disabled={isLoading}
              onClick={handleSubscribe}
              className="w-full bg-blue-600 text-white font-bold py-5 rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 group active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Zap size={20} className="fill-white" />
                  {isAuthenticated ? "Começar agora com Doctor Agent" : "Conectar Google e Assinar"}
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
               <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center gap-3 text-green-700">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <Check size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm">Assinatura Ativa</p>
                  <p className="text-[10px] opacity-80">Você tem acesso a todos os recursos.</p>
                </div>
              </div>
              
              <button 
                disabled={isLoading}
                onClick={handleManage}
                className="w-full bg-gray-900 text-white font-bold py-5 rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 group active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Settings size={20} />
                    Gerenciar Assinatura
                  </>
                )}
              </button>
            </div>
          )}
          
          <p className="text-center text-xs text-gray-400 mt-6 flex items-center justify-center gap-2">
            <Shield size={12} />
            Pagamento Seguro via Stripe. Cancele quando quiser.
          </p>
        </motion.div>
      </div>

      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-12 max-w-4xl w-full text-center">
        <TrustBadge 
          icon={<Zap className="text-yellow-500" />} 
          title="Velocidade" 
          desc="Interface otimizada para produtividade máxima." 
        />
        <TrustBadge 
          icon={<Shield className="text-green-500" />} 
          title="Privacidade" 
          desc="Seus dados continuam no seu Google Drive." 
        />
        <TrustBadge 
          icon={<Sparkles className="text-blue-500" />} 
          title="Inteligência" 
          desc="Modelos Gemini 1.5 Pro de última geração." 
        />
      </div>
    </div>
  );
}

function Feature({ item }: { item: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-700">
      <div className="w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
        <Check size={12} strokeWidth={4} />
      </div>
      <span className="text-sm font-medium">{item}</span>
    </div>
  );
}

function TrustBadge({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="space-y-2"
    >
      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
        {icon}
      </div>
      <h4 className="font-bold text-gray-900">{title}</h4>
      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
    </motion.div>
  );
}
