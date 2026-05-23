import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  HeartPulse,
  Lock,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react";

const features = [
  {
    icon: ClipboardList,
    title: "Pacientes organizados",
    description:
      "Acompanhe cada paciente por status, hospital, quarto, contatos, imagens e informações clínicas em um único lugar.",
  },
  {
    icon: CalendarDays,
    title: "Agenda cirúrgica",
    description:
      "Crie eventos, organize procedimentos e mantenha a equipe alinhada do pré-operatório até a alta.",
  },
  {
    icon: Users,
    title: "Equipe conectada",
    description:
      "Convide membros para o grupo e compartilhe o mesmo fluxo de trabalho com segurança.",
  },
  {
    icon: FileText,
    title: "Histórico completo",
    description:
      "Registre contatos, evoluções, observações, imagens e documentos importantes por paciente.",
  },
  {
    icon: MessageCircle,
    title: "Contato rápido",
    description:
      "Acesse contatos do paciente e familiares de forma simples, com integração prática para WhatsApp.",
  },
  {
    icon: ShieldCheck,
    title: "Acesso por grupo",
    description:
      "Cada usuário acessa apenas os grupos, pacientes e arquivos aos quais foi autorizado.",
  },
];

const workflow = [
  "Cadastre o paciente",
  "Defina status, hospital e leito",
  "Adicione informações, contatos e imagens",
  "Agende procedimentos e acompanhe a evolução",
];

const faqs = [
  {
    q: "Para quem é o Dr. Agent?",
    a: "Para médicos, cirurgiões e equipes que precisam acompanhar pacientes, agenda de procedimentos e informações clínicas de forma organizada.",
  },
  {
    q: "Posso usar com minha equipe?",
    a: "Sim. Você pode criar grupos, convidar membros e centralizar o fluxo de trabalho da equipe em torno dos pacientes.",
  },
  {
    q: "O app substitui meu prontuário oficial?",
    a: "Não. O Dr. Agent ajuda na organização do fluxo, comunicação e acompanhamento. O uso deve respeitar as regras internas da instituição e a legislação aplicável.",
  },
  {
    q: "Existe controle de acesso?",
    a: "Sim. A ideia do app é trabalhar com autenticação e permissões por grupo, evitando acesso a dados de grupos onde o usuário não é membro.",
  },
];

function sectionId(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[330px]">
      <div className="absolute -inset-6 rounded-[3rem] bg-blue-500/10 blur-3xl" />

      <div className="relative rounded-[2.5rem] border border-blue-100 bg-white p-3 shadow-2xl shadow-blue-900/15">
        <div className="rounded-[2rem] bg-slate-50 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Stethoscope size={17} />
              </div>
              <span className="text-sm font-black text-blue-950">
                Dr. Agent
              </span>
            </div>

            <div className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>

          <div className="mb-4 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black text-blue-950">
                  João Santos
                </p>

                <div className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">
                  60 anos
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs font-black uppercase text-blue-700">
                  Marieta
                </p>
                <p className="mt-1 text-[11px] font-bold text-slate-500">
                  Quarto 102-2
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="rounded-2xl border border-blue-200 bg-white px-3 py-3 text-[10px] font-black uppercase text-blue-700 shadow-sm"
            >
              Pré-operatório
            </button>

            <button
              type="button"
              className="rounded-2xl bg-emerald-500 px-3 py-3 text-[10px] font-black uppercase text-white shadow-lg shadow-emerald-500/20"
            >
              Agendar novo
            </button>
          </div>

          <div className="space-y-3">
            {[
              ["Contatos", "Adagir (O MESMO)", "47991084635"],
              ["Informações", "Alergia a AAS", "20/05/2026, 21:15"],
              ["Imagens", "Exame anexado", "Raio-X do tórax"],
            ].map(([title, line1, line2]) => (
              <div
                key={title}
                className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm"
              >
                <div className="flex items-center gap-3 bg-blue-50/70 px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/20">
                    <span className="text-lg leading-none">+</span>
                  </div>

                  <p className="text-sm font-black text-blue-950">{title}</p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-sm font-bold text-blue-950">{line1}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {line2}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = ["Benefícios", "Fluxo", "Segurança", "FAQ"];

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <a href="#top" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <HeartPulse size={21} />
          </div>

          <div>
            <p className="text-base font-black tracking-tight text-blue-950">
              Dr. Agent
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
              Surgical workflow
            </p>
          </div>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link}
              href={`#${sectionId(link)}`}
              className="text-sm font-bold text-slate-600 transition hover:text-blue-700"
            >
              {link}
            </a>
          ))}
        </nav>

        <a
          href="/app"
          className="hidden rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 md:inline-flex"
        >
          Quero conhecer
        </a>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-2xl border border-slate-200 p-2 text-slate-700 md:hidden"
        >
          <Menu size={22} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-blue-950/30 p-4 backdrop-blur-sm md:hidden">
          <div className="rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-black text-blue-950">Menu</p>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-slate-100 p-2"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-3">
              {links.map((link) => (
                <a
                  key={link}
                  onClick={() => setOpen(false)}
                  href={`#${sectionId(link)}`}
                  className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"
                >
                  {link}
                </a>
              ))}

              <a
                onClick={() => setOpen(false)}
                href="/app"
                className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white"
              >
                Quero conhecer
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default function LandingPage() {
  return (
    <main
      id="top"
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] text-slate-900"
    >
      <Nav />

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm">
            <Sparkles size={16} className="text-blue-600" />
            <span className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Organização clínica com inteligência
            </span>
          </div>

          <h1 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-blue-950 sm:text-5xl lg:text-7xl">
            Do pré-operatório até a alta, tudo em um único fluxo.
          </h1>

          <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-slate-600">
            O Dr. Agent ajuda médicos e equipes a organizarem pacientes, agenda
            cirúrgica, contatos, imagens e informações importantes com acesso
            por grupo.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-7 py-4 text-sm font-black text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Quero ver funcionando
              <ArrowRight size={18} />
            </a>

            <a
              href="#beneficios"
              className="inline-flex items-center justify-center rounded-full border border-blue-100 bg-white px-7 py-4 text-sm font-black text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              Ver benefícios
            </a>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500 justify-start">
            <span className="text-slate-400">Termos Legais:</span>
            <a href="/privacy" className="hover:text-blue-600 hover:underline">Privacidade</a>
            <span className="text-slate-300">•</span>
            <a href="/eula" className="hover:text-blue-600 hover:underline">Termos (EULA)</a>
          </div>

          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {[
              ["Pacientes", "por status"],
              ["Equipe", "por grupo"],
              ["Agenda", "integrada"],
            ].map(([a, b]) => (
              <div
                key={a}
                className="rounded-3xl border border-blue-100 bg-white/80 p-4 shadow-sm"
              >
                <p className="text-sm font-black text-blue-950">{a}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{b}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.05 }}
        >
          <PhoneMockup />
        </motion.div>
      </section>

      <section id="beneficios" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
            Benefícios
          </p>

          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-blue-950 sm:text-5xl">
            Menos informação espalhada. Mais clareza no cuidado.
          </h2>

          <p className="mt-5 text-base font-medium leading-7 text-slate-600">
            Uma interface simples para acompanhar o que realmente importa no dia
            a dia da equipe.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon size={24} />
                </div>

                <h3 className="text-lg font-black text-blue-950">
                  {feature.title}
                </h3>

                <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="fluxo" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid items-center gap-10 rounded-[2.5rem] border border-blue-100 bg-blue-950 p-6 text-white shadow-2xl shadow-blue-950/15 md:p-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-200">
              Fluxo simples
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-5xl">
              Tudo acompanha o paciente.
            </h2>

            <p className="mt-5 text-base font-medium leading-7 text-blue-100">
              Em vez de procurar informações em mensagens, planilhas e pastas
              soltas, cada paciente tem seu próprio histórico organizado.
            </p>
          </div>

          <div className="grid gap-3">
            {workflow.map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-blue-700">
                  {index + 1}
                </div>

                <p className="font-bold text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="seguranca" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-[2.5rem] border border-blue-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Lock size={28} />
            </div>

            <h2 className="text-3xl font-black tracking-[-0.04em] text-blue-950">
              Segurança por grupo desde o início.
            </h2>

            <p className="mt-4 text-base font-medium leading-7 text-slate-600">
              O acesso é pensado para respeitar a estrutura de grupos. Cada
              membro só deve visualizar informações do grupo em que foi
              aprovado.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              "Usuário autenticado para acessar o sistema",
              "Validação de membro antes de abrir dados do grupo",
              "Paciente vinculado ao grupo correto",
              "Arquivos vinculados ao paciente correto",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check size={18} />
                </div>

                <p className="text-sm font-bold text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
            FAQ
          </p>

          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-blue-950 sm:text-5xl">
            Perguntas rápidas
          </h2>
        </div>

        <div className="mt-10 grid gap-4">
          {faqs.map((faq) => (
            <div
              key={faq.q}
              className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm"
            >
              <h3 className="text-base font-black text-blue-950">{faq.q}</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="contato" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-blue-950 p-8 text-center text-white shadow-2xl shadow-blue-600/20 md:p-14">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm">
            <Activity size={30} />
          </div>

          <h2 className="mx-auto max-w-3xl text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            Organize seu fluxo cirúrgico com mais clareza.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-blue-100">
            Dr. Agent foi desenvolvido para médicos,
            cirurgiões e equipes que precisam centralizar o acompanhamento dos
            pacientes.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-black text-blue-700 transition hover:bg-blue-50"
            >
              Exibir aplicativo
              <ArrowRight size={18} />
            </a>

            <a
              href="#top"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10"
            >
              Voltar ao topo
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-blue-100 bg-white/70 px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <HeartPulse size={18} />
              </div>
              <p className="text-sm font-black text-blue-950">Dr. Agent</p>
            </div>
            <p className="text-xs font-medium text-slate-500 max-w-sm">
              Organização clínica e acompanhamento de pacientes para equipes médicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-slate-600">
            <a href="/privacy" className="transition hover:text-blue-600 hover:underline">
              Política de Privacidade
            </a>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <a href="/eula" className="transition hover:text-blue-600 hover:underline">
              EULA / Termos de Uso
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
