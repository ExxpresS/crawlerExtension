- decouper dans une classe appart tous les traitements post generation json comme JsonFormatter.getElementFingerprint

- séparer le markdownContent layout commun à tous les states au niveau du workflow.
- pour les states qui se suivent (meme url) on les flag comme changed-content true.
et on fait le diff du markdownContent avec le markdownContent du premier etat ayant la meme url
ex : 3 state avec la meme url :
  - 1 = page content - layout 
  - 2 = page content - page content 1
  - 3 = (page content - page content 1) - page content 2
    ... 


Actions idée : 
si j'ai pas le texte content de l'action : 
je capture en amont le html complet, je recible l'element avec le crawler (en js) et je remonte les elements jusqu'a avoir un text content
j'informe au travers de l'extension que j'ai besoin de temps pour détecter si c'est long

regle : element clické : tooltip et ou texte -> je prend 
sinon remonte à element parent puis cherche :
 est ce que le parent et ses enfant on du contexte : tous les tooltip / textes des elements parent + enfants
on remonte 2 fois max

