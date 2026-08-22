import { createDefaultMessageDemandeFormData } from "@/lib/reports-messages/document-templates/message-demande";
import { createDefaultHeatDogReportFormData } from "@/lib/reports-messages/document-templates/heat-dog-report";
import { createDefaultGenericRadioFormData } from "@/lib/reports-messages/document-templates/generic-radio-form";
import { createDefaultSickDogReportFormData } from "@/lib/reports-messages/sick-dog-report";
import type { DocumentTemplateConfig } from "@/lib/reports-messages/document-templates/types";
import type { EffectiveTemplateConfig } from "@/lib/reports-messages/document-templates/merge-template";
import {
  buildOfficialDocumentFromTemplate,
  type TemplateEngineInput,
} from "@/lib/reports-messages/document-templates/engine";
import type { OfficialDocumentModel } from "@/lib/reports-messages/official-document/types";

/** Sample document values for the admin A4 live preview (not persisted). */
export function buildSampleOfficialDocument(
  config: DocumentTemplateConfig,
  effective: EffectiveTemplateConfig,
  t: (key: string) => string,
): OfficialDocumentModel {
  const baseInput = {
    config: { ...config, sections: effective.visibleSections },
    t,
    effective,
  };

  if (config.builder === "message_demande") {
    const data = createDefaultMessageDemandeFormData();
    data.referenceNumber = "MSG-2026-001";
    data.wordCount = "42";
    data.serviceMention = "Service";
    data.messageBody =
      "J'ai l'honneur de vous adresser la présente demande relative à l'équipement de la brigade canine.";
    const input: TemplateEngineInput = {
      ...baseInput,
      builder: "message_demande",
      data,
    };
    return buildOfficialDocumentFromTemplate(input);
  }

  if (config.builder === "heat_dog") {
    const data = createDefaultHeatDogReportFormData({ userName: "Service vétérinaire" });
    data.referenceNumber = "CH-2026-012";
    data.aideSoignantName = "ISMAIL AGHDDIOU";
    data.aideSoignantGrade = "GDPX";
    data.aideSoignantMatricule = "119461";
    data.dogName = "CHERRY";
    data.specialty = "Explosifs et armes à feu";
    data.handlerName = "RAJA EL KASSMI";
    data.handlerGrade = "GDPX";
    data.handlerMatricule = "133398";
    data.hasMaster = true;
    data.heatStartDate = "2026-08-01";
    data.heatEndDate = "2026-08-21";
    data.reportDate = "2026-08-19";
    data.breed = "Berger belge Malinois";
    data.microchip = "982000123456789";
    data.dogBirthDate = "2021-03-12";
    data.gender = "female";
    data.trainingLevel = "Opérationnel";
    data.assignmentDate = "2023-01-10";
    data.healthStatus = "Bon";
    data.handlerSection = "Section Explosifs";
    const input: TemplateEngineInput = {
      ...baseInput,
      builder: "heat_dog",
      data,
    };
    return buildOfficialDocumentFromTemplate(input);
  }

  if (config.builder === "sick_dog") {
    const data = createDefaultSickDogReportFormData({ userName: "Aide-soignant vétérinaire" });
    data.origin = "UC CANINE";
    data.number = "42/2026";
    data.recipient = "Commandant de la compagnie";
    data.city = "CASABLANCA";
    data.priority = "URGENT";
    data.examReason = "Boiterie";
    data.clinicalObservations = "Boiterie du membre postérieur droit.";
    data.diagnosis = "Entorse légère";
    data.treatment = "Repos et anti-inflammatoire";
    data.medication = "AINS 5 jours";
    data.restPeriod = "7 jours";
    data.messageBody =
      "Le chien Rex est placé en repos médical suite à l'examen vétérinaire.";
    data.signatories = [
      {
        id: "1",
        name: "Sara Amrani",
        functionTitle: "Aide-soignant vétérinaire",
        order: 1,
        enabled: true,
      },
    ];
    const input: TemplateEngineInput = {
      ...baseInput,
      builder: "sick_dog",
      data,
      dog: {
        id: "sample-dog",
        name: "Rex",
        specialty: "explosives",
        status: "active",
        breed: "Malinois",
        microchip_number: "982000123456789",
        agent: {
          id: "a1",
          first_name: "Ali",
          last_name: "Benali",
          section: { id: "s1", name: "Section Explosifs" },
        },
      } as never,
    };
    return buildOfficialDocumentFromTemplate(input);
  }

  const data = createDefaultGenericRadioFormData({ userName: "Aide-soignant vétérinaire" });
  data.origin = "UC CANINE";
  data.number = "10/2026";
  data.recipient = "Commandant";
  data.city = "CASABLANCA";
  data.examReason = "Suivi";
  data.clinicalObservations = "État général satisfaisant.";
  data.treatment = "";
  data.messageBody = "Compte rendu transmis pour information.";
  data.signatories = [
    {
      id: "1",
      name: "Sara Amrani",
      functionTitle: "Aide-soignant vétérinaire",
      order: 1,
      enabled: true,
    },
  ];
  return buildOfficialDocumentFromTemplate({
    ...baseInput,
    builder: "generic_radio",
    data,
    dog: {
      id: "sample-dog",
      name: "Luna",
      specialty: "narcotics",
      status: "active",
      agent: {
        id: "a1",
        first_name: "Nadia",
        last_name: "El Amrani",
        section: { id: "s1", name: "Section Stupéfiants" },
      },
    } as never,
  });
}
